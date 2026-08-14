-- ============================================================
-- TAFAß V18.5 — FINAL RLS + REALTIME FIX
-- Corrige les erreurs observées en production Vercel/Supabase:
-- 1) infinite recursion detected in policy for conversation_members
-- 2) permission denied for table profiles
-- 3) notifications non persistantes
-- 4) réactions/commentaires/partages non rafraîchis en temps réel
-- 5) écritures messages bloquées par d'anciennes policies
--
-- Ce patch ne supprime aucune donnée.
-- ============================================================

-- ------------------------------------------------------------
-- A. PROFILS
-- ------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
CREATE POLICY "profiles_select_authenticated"
ON public.profiles FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- ------------------------------------------------------------
-- B. CONVERSATIONS
-- Important: l'application V18.4 utilise conversations.members.
-- On retire les anciennes policies qui peuvent référencer
-- conversation_members et provoquer une récursion RLS.
-- ------------------------------------------------------------
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'private';

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '';

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS members uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.conversations TO authenticated;

DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname='public' AND tablename='conversations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.conversations', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "tafa_v185_conversations_select"
ON public.conversations FOR SELECT TO authenticated
USING (auth.uid() = ANY(COALESCE(members,'{}'::uuid[])));

CREATE POLICY "tafa_v185_conversations_insert"
ON public.conversations FOR INSERT TO authenticated
WITH CHECK (auth.uid() = ANY(COALESCE(members,'{}'::uuid[])));

CREATE POLICY "tafa_v185_conversations_update"
ON public.conversations FOR UPDATE TO authenticated
USING (auth.uid() = ANY(COALESCE(members,'{}'::uuid[])))
WITH CHECK (auth.uid() = ANY(COALESCE(members,'{}'::uuid[])));

CREATE INDEX IF NOT EXISTS conversations_members_gin_idx
ON public.conversations USING gin(members);

-- ------------------------------------------------------------
-- C. MESSAGES
-- ------------------------------------------------------------
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS conversation_id uuid;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sender_id uuid;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS recipient_id uuid;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS text text NOT NULL DEFAULT '';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='messages_conversation_id_fkey'
      AND conrelid='public.messages'::regclass
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_conversation_id_fkey
      FOREIGN KEY (conversation_id)
      REFERENCES public.conversations(id)
      ON DELETE CASCADE;
  END IF;
END $$;

DROP POLICY IF EXISTS "messages_select_member" ON public.messages;
DROP POLICY IF EXISTS "messages_insert_sender" ON public.messages;
DROP POLICY IF EXISTS "messages_update_recipient" ON public.messages;

CREATE POLICY "messages_select_member"
ON public.messages FOR SELECT TO authenticated
USING (
  sender_id = auth.uid()
  OR recipient_id = auth.uid()
  OR EXISTS (
    SELECT 1
    FROM public.conversations c
    WHERE c.id = conversation_id
      AND auth.uid() = ANY(COALESCE(c.members,'{}'::uuid[]))
  )
);

CREATE POLICY "messages_insert_sender"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (sender_id = auth.uid());

CREATE POLICY "messages_update_own"
ON public.messages FOR UPDATE TO authenticated
USING (sender_id = auth.uid() OR recipient_id = auth.uid())
WITH CHECK (sender_id = auth.uid() OR recipient_id = auth.uid());

CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
ON public.messages(conversation_id, created_at);

-- ------------------------------------------------------------
-- D. RPC CONVERSATION / MESSAGE
-- Évite que d'anciennes policies RLS bloquent les écritures.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tafa_upsert_conversation(
  p_id uuid,
  p_type text DEFAULT 'private',
  p_name text DEFAULT '',
  p_members uuid[] DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non connecté';
  END IF;

  IF p_id IS NULL OR NOT (auth.uid() = ANY(COALESCE(p_members,'{}'::uuid[]))) THEN
    RAISE EXCEPTION 'Conversation non autorisée';
  END IF;

  INSERT INTO public.conversations(id,type,name,members)
  VALUES(p_id,COALESCE(p_type,'private'),COALESCE(p_name,''),p_members)
  ON CONFLICT (id) DO UPDATE SET
    type=EXCLUDED.type,
    name=EXCLUDED.name,
    members=EXCLUDED.members;

  v_id := p_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.tafa_upsert_conversation(uuid,text,text,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tafa_upsert_conversation(uuid,text,text,uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.tafa_send_message(
  p_id uuid,
  p_conversation_id uuid,
  p_recipient_id uuid,
  p_text text DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non connecté';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id=p_conversation_id
      AND auth.uid()=ANY(COALESCE(c.members,'{}'::uuid[]))
  ) THEN
    RAISE EXCEPTION 'Conversation non autorisée';
  END IF;

  INSERT INTO public.messages(
    id,conversation_id,sender_id,recipient_id,text,is_read,created_at
  ) VALUES(
    p_id,p_conversation_id,auth.uid(),p_recipient_id,COALESCE(p_text,''),false,now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.tafa_send_message(uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tafa_send_message(uuid,uuid,uuid,text) TO authenticated;

-- ------------------------------------------------------------
-- E. NOTIFICATIONS
-- ------------------------------------------------------------
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own"
ON public.notifications FOR SELECT TO authenticated
USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS "notifications_insert_actor" ON public.notifications;
CREATE POLICY "notifications_insert_actor"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (actor_id = auth.uid() OR actor_id IS NULL);

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own"
ON public.notifications FOR UPDATE TO authenticated
USING (recipient_id = auth.uid())
WITH CHECK (recipient_id = auth.uid());

DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
CREATE POLICY "notifications_delete_own"
ON public.notifications FOR DELETE TO authenticated
USING (recipient_id = auth.uid());

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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non connecté';
  END IF;
  IF p_recipient_id IS NULL OR p_recipient_id=auth.uid() THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications(
    recipient_id,actor_id,type,title,message,entity_type,entity_id,is_read,created_at
  ) VALUES(
    p_recipient_id,auth.uid(),COALESCE(p_type,'activity'),COALESCE(p_title,'Tafaß'),
    COALESCE(p_message,''),COALESCE(p_entity_type,''),p_entity_id,false,now()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.tafa_create_notification(uuid,text,text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tafa_create_notification(uuid,text,text,text,text,uuid) TO authenticated;

-- ------------------------------------------------------------
-- F. RÉACTIONS
-- ------------------------------------------------------------
ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_reactions TO authenticated;

DROP POLICY IF EXISTS "post_reactions_select_authenticated" ON public.post_reactions;
CREATE POLICY "post_reactions_select_authenticated"
ON public.post_reactions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "post_reactions_insert_own" ON public.post_reactions;
CREATE POLICY "post_reactions_insert_own"
ON public.post_reactions FOR INSERT TO authenticated
WITH CHECK (user_id=auth.uid());

DROP POLICY IF EXISTS "post_reactions_update_own" ON public.post_reactions;
CREATE POLICY "post_reactions_update_own"
ON public.post_reactions FOR UPDATE TO authenticated
USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());

DROP POLICY IF EXISTS "post_reactions_delete_own" ON public.post_reactions;
CREATE POLICY "post_reactions_delete_own"
ON public.post_reactions FOR DELETE TO authenticated
USING (user_id=auth.uid());

CREATE OR REPLACE FUNCTION public.tafa_set_post_reaction(
  p_post_id uuid,
  p_reaction text DEFAULT NULL
)
RETURNS TABLE(reaction text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid := auth.uid();
DECLARE v_owner uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT COALESCE(owner_id,user_id) INTO v_owner
  FROM public.posts WHERE id=p_post_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Publication introuvable'; END IF;

  IF p_reaction IS NULL OR btrim(p_reaction)='' THEN
    DELETE FROM public.post_reactions WHERE post_id=p_post_id AND user_id=uid;
    RETURN;
  END IF;

  INSERT INTO public.post_reactions(post_id,user_id,reaction_type)
  VALUES(p_post_id,uid,p_reaction)
  ON CONFLICT (post_id,user_id)
  DO UPDATE SET reaction_type=EXCLUDED.reaction_type;

  IF v_owner<>uid THEN
    INSERT INTO public.notifications(
      recipient_id,actor_id,type,title,message,entity_type,entity_id,is_read,created_at
    ) VALUES(
      v_owner,uid,'reaction','Tafaß','a réagi à votre publication.','post',p_post_id,false,now()
    );
  END IF;

  RETURN QUERY
  SELECT pr.reaction_type::text
  FROM public.post_reactions pr
  WHERE pr.post_id=p_post_id AND pr.user_id=uid;
END;
$$;

REVOKE ALL ON FUNCTION public.tafa_set_post_reaction(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tafa_set_post_reaction(uuid,text) TO authenticated;

-- ------------------------------------------------------------
-- G. COMMENTAIRES + notification serveur
-- ------------------------------------------------------------
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comments TO authenticated;

DROP POLICY IF EXISTS "comments_select_authenticated" ON public.comments;
CREATE POLICY "comments_select_authenticated"
ON public.comments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "comments_insert_own" ON public.comments;
CREATE POLICY "comments_insert_own"
ON public.comments FOR INSERT TO authenticated
WITH CHECK (user_id=auth.uid());

DROP POLICY IF EXISTS "comments_update_own" ON public.comments;
CREATE POLICY "comments_update_own"
ON public.comments FOR UPDATE TO authenticated
USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid());

DROP POLICY IF EXISTS "comments_delete_own" ON public.comments;
CREATE POLICY "comments_delete_own"
ON public.comments FOR DELETE TO authenticated
USING (user_id=auth.uid());

CREATE OR REPLACE FUNCTION public.tafa_comment_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_owner uuid;
BEGIN
  SELECT COALESCE(owner_id,user_id) INTO v_owner
  FROM public.posts WHERE id=NEW.post_id;

  IF v_owner IS NOT NULL AND v_owner<>NEW.user_id THEN
    INSERT INTO public.notifications(
      recipient_id,actor_id,type,title,message,entity_type,entity_id,is_read,created_at
    ) VALUES(
      v_owner,NEW.user_id,
      CASE WHEN NEW.parent_id IS NULL THEN 'comment' ELSE 'reply' END,
      'Tafaß',
      CASE WHEN NEW.parent_id IS NULL THEN 'a commenté votre publication.' ELSE 'a répondu à votre commentaire.' END,
      'post',NEW.post_id,false,now()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tafa_comment_notification_trigger ON public.comments;
CREATE TRIGGER tafa_comment_notification_trigger
AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.tafa_comment_notification();

-- ------------------------------------------------------------
-- H. PARTAGES + notification serveur
-- ------------------------------------------------------------
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS shares integer NOT NULL DEFAULT 0;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;

CREATE OR REPLACE FUNCTION public.tafa_increment_post_share(p_post_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE new_count integer;
DECLARE v_owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  UPDATE public.posts
  SET shares=COALESCE(shares,0)+1
  WHERE id=p_post_id
  RETURNING shares,COALESCE(owner_id,user_id) INTO new_count,v_owner;

  IF new_count IS NULL THEN RAISE EXCEPTION 'Publication introuvable'; END IF;

  IF v_owner IS NOT NULL AND v_owner<>auth.uid() THEN
    INSERT INTO public.notifications(
      recipient_id,actor_id,type,title,message,entity_type,entity_id,is_read,created_at
    ) VALUES(
      v_owner,auth.uid(),'share','Tafaß','a partagé votre publication.','post',p_post_id,false,now()
    );
  END IF;

  RETURN new_count;
END;
$$;

REVOKE ALL ON FUNCTION public.tafa_increment_post_share(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tafa_increment_post_share(uuid) TO authenticated;

-- ------------------------------------------------------------
-- I. REALTIME — ajouter toutes les tables réellement utilisées
-- ------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','posts','post_reactions','comments','notifications',
    'conversations','messages','friend_requests','friendships','post_shares'
  ] LOOP
    IF to_regclass('public.'||t) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM pg_publication_tables
         WHERE pubname='supabase_realtime'
           AND schemaname='public'
           AND tablename=t
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst,'reload schema';

SELECT 'TAFAß V18.5 FINAL RLS + REALTIME FIX SUCCESS' AS status;
