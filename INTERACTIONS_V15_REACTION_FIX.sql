-- TAFA V15 — REACTIONS FIX
-- Fixes reactions on own and other users' posts.
-- Allows NULL/empty reaction to remove the current user's reaction.
-- Aligns the database with the V13/V15 frontend: reaction_type.
-- Run once in Supabase SQL Editor AFTER the base interaction scripts.

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

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='post_reactions' AND column_name='reaction_type'
  ) THEN
    ALTER TABLE public.post_reactions ADD COLUMN reaction_type text;
    UPDATE public.post_reactions SET reaction_type='J''aime' WHERE reaction_type IS NULL;
    ALTER TABLE public.post_reactions ALTER COLUMN reaction_type SET NOT NULL;
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
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

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
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- IMPORTANT: do not restrict by post owner. Any authenticated user may
  -- react to any existing post according to the normal app rules.
  IF NOT EXISTS (SELECT 1 FROM public.posts WHERE id = p_post_id) THEN
    RAISE EXCEPTION 'Publication introuvable';
  END IF;

  -- NULL/empty means remove the current user's reaction.
  IF p_reaction IS NULL OR btrim(p_reaction) = '' THEN
    DELETE FROM public.post_reactions
    WHERE post_id = p_post_id AND user_id = uid;
    RETURN;
  END IF;

  IF p_reaction NOT IN ('J''aime','J''adore','Solidaire','Haha','Waouh','Triste','En colère') THEN
    RAISE EXCEPTION 'Type de réaction invalide';
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

NOTIFY pgrst, 'reload schema';
SELECT 'TAFA V15 reactions fixed' AS status;
