-- TAFAß GROUP POLLS REALTIME
-- Run after PAGES_GROUPES_REALTIME_V1.1.6.23.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.group_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.group_poll_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES public.group_polls(id) ON DELETE CASCADE,
  option_text text NOT NULL,
  position integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.group_poll_votes (
  poll_id uuid NOT NULL REFERENCES public.group_polls(id) ON DELETE CASCADE,
  option_id uuid NOT NULL REFERENCES public.group_poll_options(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(poll_id,user_id)
);

CREATE INDEX IF NOT EXISTS group_polls_group_idx ON public.group_polls(group_id);
CREATE INDEX IF NOT EXISTS group_poll_options_poll_idx ON public.group_poll_options(poll_id);
CREATE INDEX IF NOT EXISTS group_poll_votes_poll_idx ON public.group_poll_votes(poll_id);

ALTER TABLE public.group_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_poll_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS group_polls_select ON public.group_polls;
CREATE POLICY group_polls_select ON public.group_polls FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.groups g WHERE g.id=group_id AND (
    g.privacy='Public' OR EXISTS(SELECT 1 FROM public.group_members gm WHERE gm.group_id=g.id AND gm.user_id=auth.uid() AND gm.status='active')
  ))
);
DROP POLICY IF EXISTS group_polls_insert ON public.group_polls;
CREATE POLICY group_polls_insert ON public.group_polls FOR INSERT TO authenticated WITH CHECK (
  creator_id=auth.uid() AND EXISTS(SELECT 1 FROM public.group_members gm WHERE gm.group_id=group_id AND gm.user_id=auth.uid() AND gm.status='active')
);
DROP POLICY IF EXISTS group_poll_options_select ON public.group_poll_options;
CREATE POLICY group_poll_options_select ON public.group_poll_options FOR SELECT TO authenticated USING (
  EXISTS(SELECT 1 FROM public.group_polls p JOIN public.groups g ON g.id=p.group_id WHERE p.id=poll_id AND (
    g.privacy='Public' OR EXISTS(SELECT 1 FROM public.group_members gm WHERE gm.group_id=g.id AND gm.user_id=auth.uid() AND gm.status='active')
  ))
);
DROP POLICY IF EXISTS group_poll_options_insert ON public.group_poll_options;
CREATE POLICY group_poll_options_insert ON public.group_poll_options FOR INSERT TO authenticated WITH CHECK (
  EXISTS(SELECT 1 FROM public.group_polls p WHERE p.id=poll_id AND p.creator_id=auth.uid())
);
DROP POLICY IF EXISTS group_poll_votes_select ON public.group_poll_votes;
CREATE POLICY group_poll_votes_select ON public.group_poll_votes FOR SELECT TO authenticated USING (
  user_id=auth.uid() OR EXISTS(
    SELECT 1 FROM public.group_polls p JOIN public.groups g ON g.id=p.group_id
    WHERE p.id=poll_id AND (g.privacy='Public' OR EXISTS(SELECT 1 FROM public.group_members gm WHERE gm.group_id=g.id AND gm.user_id=auth.uid() AND gm.status='active'))
  )
);
DROP POLICY IF EXISTS group_poll_votes_insert ON public.group_poll_votes;
CREATE POLICY group_poll_votes_insert ON public.group_poll_votes FOR INSERT TO authenticated WITH CHECK (
  user_id=auth.uid() AND EXISTS(
    SELECT 1 FROM public.group_polls p JOIN public.group_members gm ON gm.group_id=p.group_id
    WHERE p.id=poll_id AND gm.user_id=auth.uid() AND gm.status='active'
  )
);
DROP POLICY IF EXISTS group_poll_votes_update ON public.group_poll_votes;
CREATE POLICY group_poll_votes_update ON public.group_poll_votes FOR UPDATE TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
DROP POLICY IF EXISTS group_poll_votes_delete ON public.group_poll_votes;
CREATE POLICY group_poll_votes_delete ON public.group_poll_votes FOR DELETE TO authenticated USING(user_id=auth.uid());

ALTER TABLE public.group_polls REPLICA IDENTITY FULL;
ALTER TABLE public.group_poll_options REPLICA IDENTITY FULL;
ALTER TABLE public.group_poll_votes REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='group_polls') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.group_polls;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='group_poll_options') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.group_poll_options;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='group_poll_votes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.group_poll_votes;
  END IF;
END $$;

COMMIT;
