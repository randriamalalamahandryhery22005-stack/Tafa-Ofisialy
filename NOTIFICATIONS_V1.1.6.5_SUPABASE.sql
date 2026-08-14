-- TAFAß V1.1.6.5 — Notifications / Supabase Auth
-- Compatible with the current notifications schema:
-- id, recipient_id, actor_id, type, title, message,
-- entity_type, entity_id, is_read, created_at

GRANT SELECT, UPDATE, DELETE ON TABLE public.notifications TO authenticated;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own"
ON public.notifications FOR SELECT TO authenticated
USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own"
ON public.notifications FOR UPDATE TO authenticated
USING (recipient_id = auth.uid())
WITH CHECK (recipient_id = auth.uid());

DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
CREATE POLICY "notifications_delete_own"
ON public.notifications FOR DELETE TO authenticated
USING (recipient_id = auth.uid());

CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx
ON public.notifications(recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx
ON public.notifications(recipient_id, is_read);

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
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non connecté';
  END IF;

  IF p_recipient_id IS NULL OR p_recipient_id = auth.uid() THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications(
    recipient_id,
    actor_id,
    type,
    title,
    message,
    entity_type,
    entity_id,
    is_read,
    created_at
  ) VALUES (
    p_recipient_id,
    auth.uid(),
    COALESCE(NULLIF(p_type,''),'activity'),
    COALESCE(p_title,''),
    COALESCE(p_message,''),
    COALESCE(p_entity_type,''),
    p_entity_id,
    false,
    now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.tafa_create_notification(uuid,text,text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tafa_create_notification(uuid,text,text,text,text,uuid) TO authenticated;

-- Enable Realtime for notifications without failing if it is already enabled.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END;
$$;
