-- TAFA V12 — Reactions robust fix
-- Use a SECURITY DEFINER RPC so reaction INSERT/UPDATE/DELETE does not
-- depend on the client's direct table privileges/RLS behavior.

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

  IF NOT EXISTS (SELECT 1 FROM public.posts WHERE id = p_post_id) THEN
    RAISE EXCEPTION 'Publication introuvable';
  END IF;

  -- Empty/NULL reaction means remove the current user's reaction.
  IF p_reaction IS NULL OR btrim(p_reaction) = '' THEN
    DELETE FROM public.post_reactions
    WHERE post_id = p_post_id AND user_id = uid;
    RETURN;
  END IF;

  IF p_reaction NOT IN ('J''aime','J''adore','Solidaire','Haha','Waouh','Triste','En colère') THEN
    RAISE EXCEPTION 'Type de réaction invalide';
  END IF;

  INSERT INTO public.post_reactions(post_id,user_id,reaction)
  VALUES(p_post_id,uid,p_reaction)
  ON CONFLICT (post_id,user_id)
  DO UPDATE SET reaction=EXCLUDED.reaction;

  RETURN QUERY
  SELECT pr.reaction
  FROM public.post_reactions pr
  WHERE pr.post_id=p_post_id AND pr.user_id=uid;
END;
$$;

REVOKE ALL ON FUNCTION public.tafa_set_post_reaction(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tafa_set_post_reaction(uuid,text) TO authenticated;

NOTIFY pgrst, 'reload schema';

SELECT 'TAFA V12 reactions ready' AS status;
