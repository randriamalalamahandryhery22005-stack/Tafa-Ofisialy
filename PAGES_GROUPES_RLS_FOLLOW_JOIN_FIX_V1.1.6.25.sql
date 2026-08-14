-- TAFA V1.1.6.25 — Pages follow + Groups join + group_members RLS recursion fix
BEGIN;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.page_followers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_join_requests TO authenticated;

-- ============================================================
-- SECURITY DEFINER helpers: never query group_members from a
-- group_members RLS policy directly (prevents infinite recursion).
-- ============================================================
CREATE OR REPLACE FUNCTION public.tafa_is_group_member(p_group_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = p_group_id
      AND gm.user_id = p_user_id
      AND gm.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.tafa_is_group_manager(p_group_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = p_group_id
      AND gm.user_id = p_user_id
      AND gm.role IN ('owner','admin')
      AND gm.status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = p_group_id AND g.owner_id = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.tafa_is_group_member(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tafa_is_group_manager(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tafa_is_group_member(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tafa_is_group_manager(uuid,uuid) TO authenticated;

-- ============================================================
-- group_members: remove recursive policies and replace them.
-- ============================================================
DROP POLICY IF EXISTS group_members_select ON public.group_members;
DROP POLICY IF EXISTS group_members_select_members ON public.group_members;
DROP POLICY IF EXISTS group_members_insert_self ON public.group_members;
DROP POLICY IF EXISTS group_members_update_manager ON public.group_members;
DROP POLICY IF EXISTS group_members_delete_self_or_owner ON public.group_members;
DROP POLICY IF EXISTS group_members_delete_self ON public.group_members;

CREATE POLICY group_members_select_v25
ON public.group_members
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_members.group_id AND g.owner_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_members.group_id AND g.privacy = 'Public')
  OR public.tafa_is_group_member(group_members.group_id, auth.uid())
);

CREATE POLICY group_members_insert_self_v25
ON public.group_members
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND role IN ('member','owner')
  AND status = 'active'
  AND (
    EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_members.group_id AND g.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.groups g WHERE g.id = group_members.group_id AND g.privacy = 'Public')
  )
);

CREATE POLICY group_members_update_manager_v25
ON public.group_members
FOR UPDATE TO authenticated
USING (public.tafa_is_group_manager(group_members.group_id, auth.uid()))
WITH CHECK (public.tafa_is_group_manager(group_members.group_id, auth.uid()));

CREATE POLICY group_members_delete_v25
ON public.group_members
FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR public.tafa_is_group_manager(group_members.group_id, auth.uid())
);

-- ============================================================
-- group_join_requests: helper-based policies, no recursion.
-- ============================================================
DROP POLICY IF EXISTS group_join_requests_select ON public.group_join_requests;
DROP POLICY IF EXISTS group_join_requests_select_own ON public.group_join_requests;
DROP POLICY IF EXISTS group_join_requests_insert_self ON public.group_join_requests;
DROP POLICY IF EXISTS group_join_requests_update_owner ON public.group_join_requests;
DROP POLICY IF EXISTS group_join_requests_update ON public.group_join_requests;
DROP POLICY IF EXISTS group_join_requests_delete_self_or_owner ON public.group_join_requests;
DROP POLICY IF EXISTS group_join_requests_delete ON public.group_join_requests;

CREATE POLICY group_join_requests_select_v25
ON public.group_join_requests
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.tafa_is_group_manager(group_join_requests.group_id, auth.uid())
);

CREATE POLICY group_join_requests_insert_self_v25
ON public.group_join_requests
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND status = 'pending'
  AND EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = group_join_requests.group_id
      AND g.privacy = 'Privé'
  )
);

CREATE POLICY group_join_requests_update_manager_v25
ON public.group_join_requests
FOR UPDATE TO authenticated
USING (public.tafa_is_group_manager(group_join_requests.group_id, auth.uid()))
WITH CHECK (status IN ('accepted','rejected','cancelled'));

CREATE POLICY group_join_requests_delete_v25
ON public.group_join_requests
FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.tafa_is_group_manager(group_join_requests.group_id, auth.uid()));

-- ============================================================
-- Real server-side actions for Page follow / Group join.
-- ============================================================
CREATE OR REPLACE FUNCTION public.tafa_toggle_page_follow(p_page_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid := auth.uid(); exists_follow boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pages p WHERE p.id=p_page_id) THEN RAISE EXCEPTION 'page_not_found'; END IF;
  IF EXISTS (SELECT 1 FROM public.pages p WHERE p.id=p_page_id AND p.owner_id=uid) THEN
    RAISE EXCEPTION 'cannot_follow_own_page';
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.page_followers pf WHERE pf.page_id=p_page_id AND pf.user_id=uid) INTO exists_follow;
  IF exists_follow THEN
    DELETE FROM public.page_followers WHERE page_id=p_page_id AND user_id=uid;
    RETURN json_build_object('following',false);
  ELSE
    INSERT INTO public.page_followers(page_id,user_id) VALUES(p_page_id,uid)
    ON CONFLICT(page_id,user_id) DO NOTHING;
    RETURN json_build_object('following',true);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tafa_join_group(p_group_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid := auth.uid(); gprivacy text; is_member boolean; req_id uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT privacy INTO gprivacy FROM public.groups WHERE id=p_group_id;
  IF gprivacy IS NULL THEN RAISE EXCEPTION 'group_not_found'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.group_members WHERE group_id=p_group_id AND user_id=uid AND status='active') INTO is_member;
  IF is_member THEN
    DELETE FROM public.group_members WHERE group_id=p_group_id AND user_id=uid;
    RETURN json_build_object('state','left');
  END IF;
  IF gprivacy='Public' THEN
    INSERT INTO public.group_members(group_id,user_id,role,status) VALUES(p_group_id,uid,'member','active')
    ON CONFLICT(group_id,user_id) DO UPDATE SET role='member',status='active',joined_at=now();
    RETURN json_build_object('state','joined');
  END IF;
  INSERT INTO public.group_join_requests(group_id,user_id,status) VALUES(p_group_id,uid,'pending')
  ON CONFLICT(group_id,user_id) DO UPDATE SET status='pending',updated_at=now()
  RETURNING id INTO req_id;
  RETURN json_build_object('state','requested','request_id',req_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.tafa_approve_group_join(p_request_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r public.group_join_requests%ROWTYPE; uid uuid := auth.uid();
BEGIN
  SELECT * INTO r FROM public.group_join_requests WHERE id=p_request_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF NOT public.tafa_is_group_manager(r.group_id,uid) THEN RAISE EXCEPTION 'not_group_manager'; END IF;
  UPDATE public.group_join_requests SET status='accepted',updated_at=now() WHERE id=r.id;
  INSERT INTO public.group_members(group_id,user_id,role,status) VALUES(r.group_id,r.user_id,'member','active')
  ON CONFLICT(group_id,user_id) DO UPDATE SET role='member',status='active',joined_at=now();
  RETURN json_build_object('state','accepted');
END;
$$;

CREATE OR REPLACE FUNCTION public.tafa_reject_group_join(p_request_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r public.group_join_requests%ROWTYPE; uid uuid := auth.uid();
BEGIN
  SELECT * INTO r FROM public.group_join_requests WHERE id=p_request_id FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'request_not_found'; END IF;
  IF NOT public.tafa_is_group_manager(r.group_id,uid) THEN RAISE EXCEPTION 'not_group_manager'; END IF;
  UPDATE public.group_join_requests SET status='rejected',updated_at=now() WHERE id=r.id;
  RETURN json_build_object('state','rejected');
END;
$$;

GRANT EXECUTE ON FUNCTION public.tafa_toggle_page_follow(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tafa_join_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tafa_approve_group_join(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tafa_reject_group_join(uuid) TO authenticated;

COMMIT;
NOTIFY pgrst,'reload schema';
