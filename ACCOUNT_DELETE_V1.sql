-- TAFAß — ACCOUNT / MESSAGE DELETE V1
--
-- À exécuter UNE FOIS dans Supabase > SQL Editor.
-- Ce fichier est additionnel : il ne remplace ni ne modifie les migrations
-- Realtime existantes. Il ajoute uniquement les fonctions sécurisées utilisées
-- par l'interface pour supprimer un compte, un message ou une conversation.

create or replace function public.tafa_delete_message(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.messages
  where id = p_message_id
    and (sender_id = auth.uid() or recipient_id = auth.uid());

  return found;
end;
$$;

revoke all on function public.tafa_delete_message(uuid) from public;
grant execute on function public.tafa_delete_message(uuid) to authenticated;

create or replace function public.tafa_delete_conversation(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  removed boolean := false;
begin
  delete from public.conversations
  where id = p_conversation_id
    and auth.uid() = any(members);

  removed := found;
  return removed;
end;
$$;

revoke all on function public.tafa_delete_conversation(uuid) from public;
grant execute on function public.tafa_delete_conversation(uuid) to authenticated;

-- Suppression complète du compte connecté.
-- L'ordre est volontaire : les conversations ne possèdent pas de FK vers
-- profiles via leur tableau members, donc elles sont supprimées explicitement.
-- La suppression de profiles déclenche ensuite les ON DELETE CASCADE déjà
-- présents dans le schéma Tafaß (posts, commentaires, pages, groupes, etc.).
create or replace function public.tafa_delete_my_account()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  removed boolean := false;
begin
  if uid is null then
    raise exception 'SESSION_REQUIRED';
  end if;

  -- Conversations de l'utilisateur + messages associés.
  delete from public.conversations
  where uid = any(members);

  -- Nettoyage de données directement rattachées à l'utilisateur lorsque
  -- certaines anciennes installations n'ont pas de cascade.
  begin delete from public.notifications where user_id = uid; exception when undefined_table then null; end;
  begin delete from public.friend_requests where sender_id = uid or receiver_id = uid; exception when undefined_table then null; end;
  begin delete from public.friendships where user_id = uid or friend_id = uid; exception when undefined_table then null; end;
  begin delete from public.follows where follower_id = uid or following_id = uid; exception when undefined_table then null; end;
  begin delete from public.page_followers where user_id = uid; exception when undefined_table then null; end;
  begin delete from public.group_members where user_id = uid; exception when undefined_table then null; end;
  begin delete from public.group_join_requests where user_id = uid; exception when undefined_table then null; end;

  -- Nettoyage des fichiers dont le chemin commence par l'UUID utilisateur.
  -- Les buckets sont ceux utilisés par le frontend Tafaß actuel.
  begin
    delete from storage.objects
    where bucket_id in ('profiles','posts','stories','messages','marketplace')
      and name like uid::text || '/%';
  exception when undefined_table then null;
  end;

  -- Suppression du profil : le schéma Tafaß utilise auth.users -> profiles
  -- avec ON DELETE CASCADE pour les entités qui en dépendent.
  delete from public.profiles where id = uid;
  removed := found;

  -- Suppression finale du compte Auth. Cette ligne s'exécute dans le contexte
  -- SECURITY DEFINER de la fonction installée par le propriétaire SQL.
  delete from auth.users where id = uid;

  return removed;
end;
$$;

revoke all on function public.tafa_delete_my_account() from public;
grant execute on function public.tafa_delete_my_account() to authenticated;
