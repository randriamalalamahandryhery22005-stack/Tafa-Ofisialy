-- TAFAß V1.1.6.22
-- PAGES + GROUPES : REAL DATABASE / RLS / REALTIME
-- Non-destructive: creates new community tables and adds nullable post links.

BEGIN;

CREATE TABLE IF NOT EXISTS public.pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  username text NOT NULL,
  category text NOT NULL DEFAULT 'Page',
  description text NOT NULL DEFAULT '',
  email text,
  phone text,
  website text,
  address text,
  hours text,
  services text,
  avatar_url text,
  cover_url text,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pages_username_lower_uidx
  ON public.pages (lower(username));

CREATE INDEX IF NOT EXISTS pages_owner_idx ON public.pages(owner_id);

CREATE TABLE IF NOT EXISTS public.page_followers (
  page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(page_id,user_id),
  CHECK(page_id IS NOT NULL AND user_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS page_followers_user_idx ON public.page_followers(user_id);
CREATE INDEX IF NOT EXISTS page_followers_page_idx ON public.page_followers(page_id);

CREATE TABLE IF NOT EXISTS public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Général',
  privacy text NOT NULL DEFAULT 'Public' CHECK(privacy IN ('Public','Privé')),
  description text NOT NULL DEFAULT '',
  rules text NOT NULL DEFAULT '',
  avatar_url text,
  cover_url text,
  member_count integer NOT NULL DEFAULT 0 CHECK(member_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS groups_owner_idx ON public.groups(owner_id);
CREATE INDEX IF NOT EXISTS groups_privacy_idx ON public.groups(privacy);

CREATE TABLE IF NOT EXISTS public.group_members (
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK(role IN ('owner','admin','moderator','member')),
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','banned','muted')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(group_id,user_id)
);
CREATE INDEX IF NOT EXISTS group_members_user_idx ON public.group_members(user_id);
CREATE INDEX IF NOT EXISTS group_members_group_idx ON public.group_members(group_id);

CREATE TABLE IF NOT EXISTS public.group_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(group_id,user_id)
);
CREATE INDEX IF NOT EXISTS group_join_requests_group_idx ON public.group_join_requests(group_id);
CREATE INDEX IF NOT EXISTS group_join_requests_user_idx ON public.group_join_requests(user_id);

-- Link existing posts to a real Page publisher or a real Group.
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS allowed_users uuid[] NOT NULL DEFAULT '{}';
UPDATE public.posts SET owner_id=user_id WHERE owner_id IS NULL AND user_id IS NOT NULL;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS publisher_page_id uuid;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS group_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='posts_publisher_page_id_fkey'
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_publisher_page_id_fkey
      FOREIGN KEY (publisher_page_id) REFERENCES public.pages(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='posts_group_id_fkey'
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_group_id_fkey
      FOREIGN KEY (group_id) REFERENCES public.groups(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS posts_publisher_page_idx ON public.posts(publisher_page_id);
CREATE INDEX IF NOT EXISTS posts_group_idx ON public.posts(group_id);

-- Keep group member_count correct.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='posts_owner_id_fkey') THEN
    ALTER TABLE public.posts ADD CONSTRAINT posts_owner_id_fkey FOREIGN KEY(owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.tafa_sync_group_member_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE gid uuid;
BEGIN
  gid := COALESCE(NEW.group_id, OLD.group_id);
  UPDATE public.groups g
  SET member_count = (
    SELECT count(*)::integer FROM public.group_members gm
    WHERE gm.group_id = gid AND gm.status='active'
  ), updated_at=now()
  WHERE g.id=gid;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_tafa_group_member_count ON public.group_members;
CREATE TRIGGER trg_tafa_group_member_count
AFTER INSERT OR UPDATE OR DELETE ON public.group_members
FOR EACH ROW EXECUTE FUNCTION public.tafa_sync_group_member_count();

-- RLS
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_followers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_join_requests ENABLE ROW LEVEL SECURITY;

-- Pages
DROP POLICY IF EXISTS pages_select_authenticated ON public.pages;
CREATE POLICY pages_select_authenticated ON public.pages
FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS pages_insert_owner ON public.pages;
CREATE POLICY pages_insert_owner ON public.pages
FOR INSERT TO authenticated WITH CHECK(owner_id=auth.uid());
DROP POLICY IF EXISTS pages_update_owner ON public.pages;
CREATE POLICY pages_update_owner ON public.pages
FOR UPDATE TO authenticated USING(owner_id=auth.uid()) WITH CHECK(owner_id=auth.uid());
DROP POLICY IF EXISTS pages_delete_owner ON public.pages;
CREATE POLICY pages_delete_owner ON public.pages
FOR DELETE TO authenticated USING(owner_id=auth.uid());

-- Page followers
DROP POLICY IF EXISTS page_followers_select_authenticated ON public.page_followers;
CREATE POLICY page_followers_select_authenticated ON public.page_followers
FOR SELECT TO authenticated USING(true);
DROP POLICY IF EXISTS page_followers_insert_self ON public.page_followers;
CREATE POLICY page_followers_insert_self ON public.page_followers
FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid());
DROP POLICY IF EXISTS page_followers_delete_self ON public.page_followers;
CREATE POLICY page_followers_delete_self ON public.page_followers
FOR DELETE TO authenticated USING(user_id=auth.uid());

-- Groups: metadata is discoverable; private content is protected by membership policies below.
DROP POLICY IF EXISTS groups_select_authenticated ON public.groups;
CREATE POLICY groups_select_authenticated ON public.groups
FOR SELECT TO authenticated USING(true);
DROP POLICY IF EXISTS groups_insert_owner ON public.groups;
CREATE POLICY groups_insert_owner ON public.groups
FOR INSERT TO authenticated WITH CHECK(owner_id=auth.uid());
DROP POLICY IF EXISTS groups_update_owner ON public.groups;
CREATE POLICY groups_update_owner ON public.groups
FOR UPDATE TO authenticated USING(owner_id=auth.uid()) WITH CHECK(owner_id=auth.uid());
DROP POLICY IF EXISTS groups_delete_owner ON public.groups;
CREATE POLICY groups_delete_owner ON public.groups
FOR DELETE TO authenticated USING(owner_id=auth.uid());

-- Members: public groups allow users to join themselves; private membership is owner/manager controlled.
DROP POLICY IF EXISTS group_members_select ON public.group_members;
CREATE POLICY group_members_select ON public.group_members
FOR SELECT TO authenticated USING(
  user_id=auth.uid()
  OR EXISTS(SELECT 1 FROM public.groups g WHERE g.id=group_id AND g.owner_id=auth.uid())
  OR EXISTS(SELECT 1 FROM public.groups g WHERE g.id=group_id AND g.privacy='Public')
);
DROP POLICY IF EXISTS group_members_insert_self ON public.group_members;
CREATE POLICY group_members_insert_self ON public.group_members
FOR INSERT TO authenticated WITH CHECK(
  user_id=auth.uid()
  AND (
    EXISTS(SELECT 1 FROM public.groups g WHERE g.id=group_id AND g.privacy='Public')
    OR EXISTS(SELECT 1 FROM public.groups g WHERE g.id=group_id AND g.owner_id=auth.uid())
  )
);
DROP POLICY IF EXISTS group_members_update_manager ON public.group_members;
CREATE POLICY group_members_update_manager ON public.group_members
FOR UPDATE TO authenticated USING(
  EXISTS(SELECT 1 FROM public.groups g WHERE g.id=group_id AND g.owner_id=auth.uid())
) WITH CHECK(true);
DROP POLICY IF EXISTS group_members_delete_self_or_owner ON public.group_members;
CREATE POLICY group_members_delete_self_or_owner ON public.group_members
FOR DELETE TO authenticated USING(
  user_id=auth.uid()
  OR EXISTS(SELECT 1 FROM public.groups g WHERE g.id=group_id AND g.owner_id=auth.uid())
);

-- Join requests
DROP POLICY IF EXISTS group_join_requests_select ON public.group_join_requests;
CREATE POLICY group_join_requests_select ON public.group_join_requests
FOR SELECT TO authenticated USING(
  user_id=auth.uid()
  OR EXISTS(SELECT 1 FROM public.groups g WHERE g.id=group_id AND g.owner_id=auth.uid())
);
DROP POLICY IF EXISTS group_join_requests_insert_self ON public.group_join_requests;
CREATE POLICY group_join_requests_insert_self ON public.group_join_requests
FOR INSERT TO authenticated WITH CHECK(user_id=auth.uid());
DROP POLICY IF EXISTS group_join_requests_update_owner ON public.group_join_requests;
CREATE POLICY group_join_requests_update_owner ON public.group_join_requests
FOR UPDATE TO authenticated USING(
  EXISTS(SELECT 1 FROM public.groups g WHERE g.id=group_id AND g.owner_id=auth.uid())
) WITH CHECK(true);
DROP POLICY IF EXISTS group_join_requests_delete_self_or_owner ON public.group_join_requests;
CREATE POLICY group_join_requests_delete_self_or_owner ON public.group_join_requests
FOR DELETE TO authenticated USING(
  user_id=auth.uid()
  OR EXISTS(SELECT 1 FROM public.groups g WHERE g.id=group_id AND g.owner_id=auth.uid())
);

-- Posts: preserve existing social behavior, plus real Page and Group publishing.
DROP POLICY IF EXISTS posts_select_authenticated ON public.posts;
CREATE POLICY posts_select_authenticated ON public.posts
FOR SELECT TO authenticated USING(
  (group_id IS NULL AND (
    visibility IN ('Public','public')
    OR owner_id=auth.uid()
    OR auth.uid()=ANY(COALESCE(allowed_users,'{}'::uuid[]))
  ))
  OR (group_id IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.groups g
    WHERE g.id=posts.group_id
      AND (g.privacy='Public' OR EXISTS(
        SELECT 1 FROM public.group_members gm
        WHERE gm.group_id=g.id AND gm.user_id=auth.uid() AND gm.status='active'
      ))
  ))
);

DROP POLICY IF EXISTS posts_insert_own ON public.posts;
CREATE POLICY posts_insert_own ON public.posts
FOR INSERT TO authenticated WITH CHECK(
  owner_id=auth.uid()
  AND (
    (publisher_page_id IS NULL AND group_id IS NULL)
    OR (publisher_page_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.pages p WHERE p.id=publisher_page_id AND p.owner_id=auth.uid()
    ) AND group_id IS NULL)
    OR (group_id IS NOT NULL AND publisher_page_id IS NULL AND EXISTS(
      SELECT 1 FROM public.group_members gm WHERE gm.group_id=group_id AND gm.user_id=auth.uid() AND gm.status='active'
    ))
  )
);

DROP POLICY IF EXISTS posts_update_own ON public.posts;
CREATE POLICY posts_update_own ON public.posts
FOR UPDATE TO authenticated USING(owner_id=auth.uid()) WITH CHECK(owner_id=auth.uid());
DROP POLICY IF EXISTS posts_delete_own ON public.posts;
CREATE POLICY posts_delete_own ON public.posts
FOR DELETE TO authenticated USING(owner_id=auth.uid());

-- Realtime: add only if not already present.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='pages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='page_followers') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.page_followers;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='groups') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.groups;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='group_members') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.group_members;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='group_join_requests') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.group_join_requests;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;
