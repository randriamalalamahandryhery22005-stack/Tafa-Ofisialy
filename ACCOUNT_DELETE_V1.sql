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
-- Version schema-compatible : certaines installations Tafaß utilisent
-- recipient_id, requester_id/receiver_id, etc. On ne référence jamais une
-- colonne optionnelle qui n'existe pas ; les suppressions sont conditionnées
-- à la présence réelle des colonnes.
create or replace function public.tafa_delete_my_account()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  removed boolean := false;
  has_col boolean;
begin
  if uid is null then
    raise exception 'SESSION_REQUIRED';
  end if;

  -- Conversations : le schéma V18 utilise members uuid[].
  if to_regclass('public.conversations') is not null then
    if exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name='conversations' and column_name='members'
    ) then
      delete from public.conversations where uid = any(members);
    end if;
  end if;

  -- Tables sociales : chaque colonne est vérifiée avant DELETE afin de rester
  -- compatible avec les variantes historiques du schéma.
  if to_regclass('public.notifications') is not null then
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='notifications' and column_name='recipient_id') then
      execute 'delete from public.notifications where recipient_id = $1' using uid;
    elsif exists (select 1 from information_schema.columns where table_schema='public' and table_name='notifications' and column_name='user_id') then
      execute 'delete from public.notifications where user_id = $1' using uid;
    end if;
  end if;

  if to_regclass('public.friend_requests') is not null then
    execute 'delete from public.friend_requests where sender_id = $1 or receiver_id = $1' using uid;
  end if;

  if to_regclass('public.friendships') is not null then
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='friendships' and column_name='user_id')
       and exists (select 1 from information_schema.columns where table_schema='public' and table_name='friendships' and column_name='friend_id') then
      execute 'delete from public.friendships where user_id = $1 or friend_id = $1' using uid;
    elsif exists (select 1 from information_schema.columns where table_schema='public' and table_name='friendships' and column_name='requester_id')
       and exists (select 1 from information_schema.columns where table_schema='public' and table_name='friendships' and column_name='receiver_id') then
      execute 'delete from public.friendships where requester_id = $1 or receiver_id = $1' using uid;
    end if;
  end if;

  if to_regclass('public.follows') is not null then
    execute 'delete from public.follows where follower_id = $1 or following_id = $1' using uid;
  end if;

  if to_regclass('public.page_followers') is not null then
    execute 'delete from public.page_followers where user_id = $1' using uid;
  end if;

  if to_regclass('public.group_members') is not null then
    execute 'delete from public.group_members where user_id = $1' using uid;
  end if;

  if to_regclass('public.group_join_requests') is not null then
    execute 'delete from public.group_join_requests where user_id = $1' using uid;
  end if;

  -- Messages directs éventuels hors conversations.
  if to_regclass('public.messages') is not null then
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name='messages' and column_name='sender_id')
       and exists (select 1 from information_schema.columns where table_schema='public' and table_name='messages' and column_name='recipient_id') then
      execute 'delete from public.messages where sender_id = $1 or recipient_id = $1' using uid;
    end if;
  end if;

  -- Fichiers : suppression SQL des objets Storage si autorisée par le schéma.
  begin
    delete from storage.objects
    where bucket_id in ('profiles','posts','stories','messages','marketplace')
      and name like uid::text || '/%';
  exception when undefined_table or insufficient_privilege then
    null;
  end;

  -- Le profil est la racine des entités Tafaß qui ont ON DELETE CASCADE.
  delete from public.profiles where id = uid;
  removed := found;

  -- Suppression finale de l'utilisateur Auth.
  delete from auth.users where id = uid;

  return removed;
end;
$$;

revoke all on function public.tafa_delete_my_account() from public;
grant execute on function public.tafa_delete_my_account() to authenticated;

comment on function public.tafa_delete_my_account() is
'Tafaß: suppression complète du compte connecté, compatible avec les variantes de schéma historiques.';
