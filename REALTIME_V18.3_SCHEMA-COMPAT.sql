-- TAFAß V18.3 — REALTIME + SCHEMA COMPATIBILITY FIX
-- IMPORTANT: This patch adapts the existing database instead of assuming a fresh schema.
-- It preserves existing data and does not change the interface.

-- ============================================================
-- 1) POSTS: support both legacy user_id and current app owner_id
-- ============================================================
DO $$
BEGIN
  IF to_regclass('public.posts') IS NULL THEN
    RAISE EXCEPTION 'Table public.posts is missing. Run the original Tafaß schema first.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='posts' AND column_name='owner_id') THEN
    ALTER TABLE public.posts ADD COLUMN owner_id uuid;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='posts' AND column_name='user_id') THEN
    ALTER TABLE public.posts ADD COLUMN user_id uuid;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='posts' AND column_name='visibility') THEN
    ALTER TABLE public.posts ADD COLUMN visibility text NOT NULL DEFAULT 'Public';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='posts' AND column_name='allowed_users') THEN
    ALTER TABLE public.posts ADD COLUMN allowed_users uuid[] NOT NULL DEFAULT '{}';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='posts' AND column_name='shares') THEN
    ALTER TABLE public.posts ADD COLUMN shares integer NOT NULL DEFAULT 0;
  END IF;

  UPDATE public.posts SET owner_id=user_id WHERE owner_id IS NULL AND user_id IS NOT NULL;
  UPDATE public.posts SET user_id=owner_id WHERE user_id IS NULL AND owner_id IS NOT NULL;
END $$;

-- Keep legacy and current owner columns synchronized before constraints are checked.
CREATE OR REPLACE FUNCTION public.tafa_sync_post_owner()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.owner_id IS NULL AND NEW.user_id IS NOT NULL THEN NEW.owner_id := NEW.user_id; END IF;
  IF NEW.user_id IS NULL AND NEW.owner_id IS NOT NULL THEN NEW.user_id := NEW.owner_id; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tafa_sync_post_owner_trigger ON public.posts;
CREATE TRIGGER tafa_sync_post_owner_trigger
BEFORE INSERT OR UPDATE ON public.posts
FOR EACH ROW EXECUTE FUNCTION public.tafa_sync_post_owner();

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;

DROP POLICY IF EXISTS "posts_select_authenticated" ON public.posts;
CREATE POLICY "posts_select_authenticated" ON public.posts
FOR SELECT TO authenticated USING (
  COALESCE(visibility,'Public') IN ('Public','public')
  OR owner_id = auth.uid()
  OR user_id = auth.uid()
  OR (auth.uid() = ANY(COALESCE(allowed_users,'{}'::uuid[])))
);

DROP POLICY IF EXISTS "posts_insert_own" ON public.posts;
CREATE POLICY "posts_insert_own" ON public.posts
FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() OR user_id = auth.uid());

DROP POLICY IF EXISTS "posts_update_own" ON public.posts;
CREATE POLICY "posts_update_own" ON public.posts
FOR UPDATE TO authenticated USING (owner_id = auth.uid() OR user_id = auth.uid())
WITH CHECK (owner_id = auth.uid() OR user_id = auth.uid());

DROP POLICY IF EXISTS "posts_delete_own" ON public.posts;
CREATE POLICY "posts_delete_own" ON public.posts
FOR DELETE TO authenticated USING (owner_id = auth.uid() OR user_id = auth.uid());

-- ============================================================
-- 2) COMMENTS: support current app content and legacy text
-- ============================================================
DO $$
BEGIN
  IF to_regclass('public.comments') IS NULL THEN
    RAISE EXCEPTION 'Table public.comments is missing. Run the original Tafaß schema first.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='comments' AND column_name='content') THEN
    ALTER TABLE public.comments ADD COLUMN content text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='comments' AND column_name='text') THEN
    ALTER TABLE public.comments ADD COLUMN text text;
  END IF;
  UPDATE public.comments SET content=text WHERE content IS NULL AND text IS NOT NULL;
  UPDATE public.comments SET text=content WHERE text IS NULL AND content IS NOT NULL;
END $$;

CREATE OR REPLACE FUNCTION public.tafa_sync_comment_content()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.content IS NULL AND NEW.text IS NOT NULL THEN NEW.content := NEW.text; END IF;
  IF NEW.text IS NULL AND NEW.content IS NOT NULL THEN NEW.text := NEW.content; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tafa_sync_comment_content_trigger ON public.comments;
CREATE TRIGGER tafa_sync_comment_content_trigger
BEFORE INSERT OR UPDATE ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.tafa_sync_comment_content();

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comments TO authenticated;
DROP POLICY IF EXISTS "comments_select_authenticated" ON public.comments;
CREATE POLICY "comments_select_authenticated" ON public.comments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "comments_insert_own" ON public.comments;
CREATE POLICY "comments_insert_own" ON public.comments FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid());
DROP POLICY IF EXISTS "comments_update_own" ON public.comments;
CREATE POLICY "comments_update_own" ON public.comments FOR UPDATE TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
DROP POLICY IF EXISTS "comments_delete_own" ON public.comments;
CREATE POLICY "comments_delete_own" ON public.comments FOR DELETE TO authenticated USING (user_id=auth.uid());

-- ============================================================
-- 3) REACTIONS: normalize reaction column name
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='post_reactions' AND column_name='reaction')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='post_reactions' AND column_name='reaction_type') THEN
    ALTER TABLE public.post_reactions RENAME COLUMN reaction TO reaction_type;
  END IF;
END $$;

ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_reactions TO authenticated;
DROP POLICY IF EXISTS "post_reactions_select_authenticated" ON public.post_reactions;
CREATE POLICY "post_reactions_select_authenticated" ON public.post_reactions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "post_reactions_insert_own" ON public.post_reactions;
CREATE POLICY "post_reactions_insert_own" ON public.post_reactions FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid());
DROP POLICY IF EXISTS "post_reactions_update_own" ON public.post_reactions;
CREATE POLICY "post_reactions_update_own" ON public.post_reactions FOR UPDATE TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());
DROP POLICY IF EXISTS "post_reactions_delete_own" ON public.post_reactions;
CREATE POLICY "post_reactions_delete_own" ON public.post_reactions FOR DELETE TO authenticated USING (user_id=auth.uid());

CREATE OR REPLACE FUNCTION public.tafa_set_post_reaction(p_post_id uuid,p_reaction text DEFAULT NULL)
RETURNS TABLE(reaction text) LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_reaction IS NULL OR btrim(p_reaction)='' THEN
    DELETE FROM public.post_reactions WHERE post_id=p_post_id AND user_id=uid;
    RETURN;
  END IF;
  INSERT INTO public.post_reactions(post_id,user_id,reaction_type) VALUES(p_post_id,uid,p_reaction)
  ON CONFLICT (post_id,user_id) DO UPDATE SET reaction_type=EXCLUDED.reaction_type;
  RETURN QUERY SELECT pr.reaction_type::text FROM public.post_reactions pr WHERE pr.post_id=p_post_id AND pr.user_id=uid;
END;
$$;
GRANT EXECUTE ON FUNCTION public.tafa_set_post_reaction(uuid,text) TO authenticated;

-- ============================================================
-- 4) MESSAGES / CONVERSATIONS
-- ============================================================
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS members uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS conversation_id uuid;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sender_id uuid;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS recipient_id uuid;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS text text NOT NULL DEFAULT '';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
DROP POLICY IF EXISTS "conversations_select_member" ON public.conversations;
CREATE POLICY "conversations_select_member" ON public.conversations FOR SELECT TO authenticated USING (auth.uid()=ANY(members));
DROP POLICY IF EXISTS "conversations_insert_member" ON public.conversations;
CREATE POLICY "conversations_insert_member" ON public.conversations FOR INSERT TO authenticated WITH CHECK (auth.uid()=ANY(members));
DROP POLICY IF EXISTS "conversations_update_member" ON public.conversations;
CREATE POLICY "conversations_update_member" ON public.conversations FOR UPDATE TO authenticated USING (auth.uid()=ANY(members)) WITH CHECK (auth.uid()=ANY(members));
DROP POLICY IF EXISTS "messages_select_member" ON public.messages;
CREATE POLICY "messages_select_member" ON public.messages FOR SELECT TO authenticated USING (sender_id=auth.uid() OR recipient_id=auth.uid() OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id=conversation_id AND auth.uid()=ANY(c.members)));
DROP POLICY IF EXISTS "messages_insert_sender" ON public.messages;
CREATE POLICY "messages_insert_sender" ON public.messages FOR INSERT TO authenticated WITH CHECK (sender_id=auth.uid() AND EXISTS (SELECT 1 FROM public.conversations c WHERE c.id=conversation_id AND auth.uid()=ANY(c.members)));
DROP POLICY IF EXISTS "messages_update_recipient" ON public.messages;
CREATE POLICY "messages_update_recipient" ON public.messages FOR UPDATE TO authenticated USING (recipient_id=auth.uid() OR sender_id=auth.uid()) WITH CHECK (recipient_id=auth.uid() OR sender_id=auth.uid());

-- ============================================================
-- 5) NOTIFICATIONS
-- ============================================================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT TO authenticated USING (recipient_id=auth.uid());
DROP POLICY IF EXISTS "notifications_insert_actor" ON public.notifications;
CREATE POLICY "notifications_insert_actor" ON public.notifications FOR INSERT TO authenticated WITH CHECK (actor_id=auth.uid() OR actor_id IS NULL);
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE TO authenticated USING (recipient_id=auth.uid()) WITH CHECK (recipient_id=auth.uid());
DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
CREATE POLICY "notifications_delete_own" ON public.notifications FOR DELETE TO authenticated USING (recipient_id=auth.uid());

-- ============================================================
-- 6) REALTIME publication
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','posts','post_reactions','comments','friend_requests','friendships','notifications','conversations','messages'] LOOP
    IF to_regclass('public.'||t) IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst,'reload schema';
SELECT 'TAFAß V18.3 SCHEMA COMPATIBILITY + REALTIME OK' AS status;
