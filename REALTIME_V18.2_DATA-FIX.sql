-- TAFAß V18.2 — DATA / REALTIME FIX
-- Run once AFTER V18.1.
-- This patch fixes the live schema used by the current app.
-- It does NOT delete or recreate existing data.

-- ============================================================
-- POSTS
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.posts TO authenticated;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "posts_select_authenticated" ON public.posts;
CREATE POLICY "posts_select_authenticated"
ON public.posts FOR SELECT TO authenticated
USING (
  visibility = 'Public'
  OR visibility = 'public'
  OR owner_id = auth.uid()
  OR (auth.uid() = ANY(allowed_users))
  OR (
    visibility IN ('Amis','friends')
    AND EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE (f.user_id = auth.uid() AND f.friend_id = owner_id)
         OR (f.friend_id = auth.uid() AND f.user_id = owner_id)
    )
  )
);

DROP POLICY IF EXISTS "posts_insert_own" ON public.posts;
CREATE POLICY "posts_insert_own"
ON public.posts FOR INSERT TO authenticated
WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "posts_update_own" ON public.posts;
CREATE POLICY "posts_update_own"
ON public.posts FOR UPDATE TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "posts_delete_own" ON public.posts;
CREATE POLICY "posts_delete_own"
ON public.posts FOR DELETE TO authenticated
USING (owner_id = auth.uid());

-- ============================================================
-- COMMENTS
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.comments TO authenticated;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comments_select_authenticated" ON public.comments;
CREATE POLICY "comments_select_authenticated"
ON public.comments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "comments_insert_own" ON public.comments;
CREATE POLICY "comments_insert_own"
ON public.comments FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "comments_update_own" ON public.comments;
CREATE POLICY "comments_update_own"
ON public.comments FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "comments_delete_own" ON public.comments;
CREATE POLICY "comments_delete_own"
ON public.comments FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- ============================================================
-- REACTIONS
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='post_reactions' AND column_name='reaction'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='post_reactions' AND column_name='reaction_type'
  ) THEN
    ALTER TABLE public.post_reactions RENAME COLUMN reaction TO reaction_type;
  END IF;
END $$;

ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.post_reactions TO authenticated;

DROP POLICY IF EXISTS "post_reactions_select_authenticated" ON public.post_reactions;
CREATE POLICY "post_reactions_select_authenticated"
ON public.post_reactions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "post_reactions_insert_own" ON public.post_reactions;
CREATE POLICY "post_reactions_insert_own"
ON public.post_reactions FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "post_reactions_update_own" ON public.post_reactions;
CREATE POLICY "post_reactions_update_own"
ON public.post_reactions FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "post_reactions_delete_own" ON public.post_reactions;
CREATE POLICY "post_reactions_delete_own"
ON public.post_reactions FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.tafa_set_post_reaction(
  p_post_id uuid,
  p_reaction text DEFAULT NULL
)
RETURNS TABLE(reaction text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.posts WHERE id=p_post_id) THEN
    RAISE EXCEPTION 'Publication introuvable';
  END IF;

  IF p_reaction IS NULL OR btrim(p_reaction)='' THEN
    DELETE FROM public.post_reactions WHERE post_id=p_post_id AND user_id=uid;
    RETURN;
  END IF;

  INSERT INTO public.post_reactions(post_id,user_id,reaction_type)
  VALUES(p_post_id,uid,p_reaction)
  ON CONFLICT (post_id,user_id)
  DO UPDATE SET reaction_type=EXCLUDED.reaction_type;

  RETURN QUERY
  SELECT pr.reaction_type::text
  FROM public.post_reactions pr
  WHERE pr.post_id=p_post_id AND pr.user_id=uid;
END;
$$;

REVOKE ALL ON FUNCTION public.tafa_set_post_reaction(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tafa_set_post_reaction(uuid,text) TO authenticated;

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
GRANT SELECT, UPDATE, DELETE ON TABLE public.notifications TO authenticated;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications
FOR SELECT TO authenticated USING (recipient_id=auth.uid());

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications
FOR UPDATE TO authenticated USING (recipient_id=auth.uid()) WITH CHECK (recipient_id=auth.uid());

DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
CREATE POLICY "notifications_delete_own" ON public.notifications
FOR DELETE TO authenticated USING (recipient_id=auth.uid());

CREATE OR REPLACE FUNCTION public.tafa_create_notification(
  p_recipient_id uuid,
  p_type text,
  p_title text DEFAULT '',
  p_message text DEFAULT '',
  p_entity_type text DEFAULT '',
  p_entity_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Utilisateur non connecté'; END IF;
  IF p_recipient_id IS NULL OR p_recipient_id=auth.uid() THEN RETURN NULL; END IF;
  INSERT INTO public.notifications(recipient_id,actor_id,type,title,message,entity_type,entity_id,is_read,created_at)
  VALUES(p_recipient_id,auth.uid(),COALESCE(p_type,'activity'),COALESCE(p_title,''),COALESCE(p_message,''),COALESCE(p_entity_type,''),p_entity_id,false,now())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.tafa_create_notification(uuid,text,text,text,text,uuid) TO authenticated;

-- ============================================================
-- MESSAGES / CONVERSATIONS
-- ============================================================
GRANT SELECT, INSERT, UPDATE ON TABLE public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.messages TO authenticated;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversations_select_member" ON public.conversations;
CREATE POLICY "conversations_select_member" ON public.conversations
FOR SELECT TO authenticated USING (auth.uid()=ANY(members));

DROP POLICY IF EXISTS "conversations_insert_member" ON public.conversations;
CREATE POLICY "conversations_insert_member" ON public.conversations
FOR INSERT TO authenticated WITH CHECK (auth.uid()=ANY(members));

DROP POLICY IF EXISTS "conversations_update_member" ON public.conversations;
CREATE POLICY "conversations_update_member" ON public.conversations
FOR UPDATE TO authenticated USING (auth.uid()=ANY(members)) WITH CHECK (auth.uid()=ANY(members));

DROP POLICY IF EXISTS "messages_select_member" ON public.messages;
CREATE POLICY "messages_select_member" ON public.messages
FOR SELECT TO authenticated
USING (
  sender_id=auth.uid() OR recipient_id=auth.uid()
  OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id=conversation_id AND auth.uid()=ANY(c.members))
);

DROP POLICY IF EXISTS "messages_insert_sender" ON public.messages;
CREATE POLICY "messages_insert_sender" ON public.messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_id=auth.uid()
  AND EXISTS (SELECT 1 FROM public.conversations c WHERE c.id=conversation_id AND auth.uid()=ANY(c.members))
);

DROP POLICY IF EXISTS "messages_update_recipient" ON public.messages;
CREATE POLICY "messages_update_recipient" ON public.messages
FOR UPDATE TO authenticated
USING (recipient_id=auth.uid() OR sender_id=auth.uid())
WITH CHECK (recipient_id=auth.uid() OR sender_id=auth.uid());

-- ============================================================
-- REALTIME
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','posts','post_reactions','comments','friend_requests',
    'friendships','notifications','conversations','messages'
  ] loop
    if exists(select 1 from pg_tables where schemaname='public' and tablename=t)
       and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
      execute format('alter publication supabase_realtime add table public.%I',t);
    end if;
  end loop;
end $$;

NOTIFY pgrst,'reload schema';
SELECT 'TAFAß V18.2 DATA/REALTIME FIX OK' AS status;
