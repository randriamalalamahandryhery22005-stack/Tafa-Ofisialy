-- TAFAß PUBLICATIONS — EXISTING POSTS SCHEMA FIX
-- Compatible with the current public.posts schema:
-- id, user_id, content, media_url, media_type, visibility,
-- created_at, updated_at, shares.
-- Does not recreate or rename columns.

BEGIN;

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "posts_insert_own" ON public.posts;
CREATE POLICY "posts_insert_own"
ON public.posts FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "posts_update_own" ON public.posts;
CREATE POLICY "posts_update_own"
ON public.posts FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "posts_delete_own" ON public.posts;
CREATE POLICY "posts_delete_own"
ON public.posts FOR DELETE TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "posts_select_authenticated" ON public.posts;
DROP POLICY IF EXISTS "posts_select_friends" ON public.posts;

CREATE POLICY "posts_select_authenticated"
ON public.posts FOR SELECT TO authenticated
USING (
  visibility = 'Public'
  OR user_id = auth.uid()
);

NOTIFY pgrst, 'reload schema';

COMMIT;
