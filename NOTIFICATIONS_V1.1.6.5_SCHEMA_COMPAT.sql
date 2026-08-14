-- Tafaß V1.1.6.5 — Notifications schema compatible fix
-- Existing public.notifications columns:
-- id, user_id, actor_id, type, post_id, message, is_read, created_at, comment_id
-- This script does NOT add recipient_id or any new notification column.

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.notifications TO authenticated;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;

CREATE POLICY "notifications_select_own"
ON public.notifications FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "notifications_insert"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (actor_id = auth.uid());

CREATE POLICY "notifications_update_own"
ON public.notifications FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications_delete_own"
ON public.notifications FOR DELETE TO authenticated
USING (user_id = auth.uid());
