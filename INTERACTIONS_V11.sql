-- TAFA V11 — FIX interactions against the EXISTING Tafa database schema
-- IMPORTANT: run this patch once. Do NOT rerun the old full supabase.sql.

-- ============================================================
-- 1) COMMENTS: the live database uses `content`, not `text`.
-- ============================================================
DO $$
BEGIN
  IF to_regclass('public.comments') IS NULL THEN
    CREATE TABLE public.comments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
      parent_id uuid REFERENCES public.comments(id) ON DELETE CASCADE,
      content text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now(),
      edited_at timestamptz
    );
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='comments' AND column_name='content'
    ) THEN
      ALTER TABLE public.comments ADD COLUMN content text NOT NULL DEFAULT '';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='comments' AND column_name='parent_id'
    ) THEN
      ALTER TABLE public.comments
        ADD COLUMN parent_id uuid REFERENCES public.comments(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='comments' AND column_name='edited_at'
    ) THEN
      ALTER TABLE public.comments ADD COLUMN edited_at timestamptz;
    END IF;
  END IF;
END $$;

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.comments TO authenticated;

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

CREATE INDEX IF NOT EXISTS comments_post_id_idx ON public.comments(post_id);
CREATE INDEX IF NOT EXISTS comments_created_at_idx ON public.comments(created_at);

-- ============================================================
-- 2) REACTIONS: enforce the table + RLS/grants used by the app.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.post_reactions (
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

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
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "post_reactions_delete_own" ON public.post_reactions;
CREATE POLICY "post_reactions_delete_own"
ON public.post_reactions FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- ============================================================
-- 3) SHARES: use the existing posts.shares counter.
-- A SECURITY DEFINER RPC is required because users can share
-- somebody else's post, while posts UPDATE is owner-only.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='posts' AND column_name='shares'
  ) THEN
    ALTER TABLE public.posts ADD COLUMN shares integer NOT NULL DEFAULT 0;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.tafa_increment_post_share(p_post_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  UPDATE public.posts
     SET shares = COALESCE(shares, 0) + 1
   WHERE id = p_post_id
  RETURNING shares INTO new_count;

  IF new_count IS NULL THEN
    RAISE EXCEPTION 'Publication introuvable';
  END IF;

  RETURN new_count;
END;
$$;

REVOKE ALL ON FUNCTION public.tafa_increment_post_share(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tafa_increment_post_share(uuid) TO authenticated;

-- ============================================================
-- 4) PostgREST schema cache refresh.
-- ============================================================
NOTIFY pgrst, 'reload schema';

SELECT 'TAFA V11 interactions ready' AS status;
