-- TAFAß V1.1.6 — COMMENTS + COMMENT REACTIONS + NOTIFICATION SOURCES
-- Exact live schema supplied by the user.
-- posts: id, user_id, ...
-- comments: id, post_id, user_id, content, text, ..., parent_id
-- comment_likes: comment_id, user_id, created_at
-- notifications: id, user_id, actor_id, type, post_id, message, is_read, created_at

create extension if not exists pgcrypto;

-- ============================================================
-- COMMENTS
-- ============================================================
alter table public.comments enable row level security;
grant select, insert, update, delete on public.comments to authenticated;

drop policy if exists "comments_select_authenticated" on public.comments;
create policy "comments_select_authenticated" on public.comments
for select to authenticated using (true);

drop policy if exists "comments_insert_own" on public.comments;
create policy "comments_insert_own" on public.comments
for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (select 1 from public.posts p where p.id = post_id)
  and (
    parent_id is null
    or exists (
      select 1 from public.comments pc
      where pc.id = parent_id and pc.post_id = post_id
    )
  )
);

drop policy if exists "comments_update_own" on public.comments;
create policy "comments_update_own" on public.comments
for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists "comments_delete_own" on public.comments;
create policy "comments_delete_own" on public.comments
for delete to authenticated using (user_id=auth.uid());

create or replace function public.tafa_sync_comment_text()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.text is null or btrim(new.text)='' then new.text := coalesce(new.content,''); end if;
  if new.content is null or btrim(new.content)='' then new.content := new.text; end if;
  return new;
end;
$$;

drop trigger if exists trg_tafa_sync_comment_text on public.comments;
create trigger trg_tafa_sync_comment_text
before insert or update of text, content on public.comments
for each row execute function public.tafa_sync_comment_text();

create or replace function public.tafa_validate_comment_parent()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.parent_id is not null and not exists (
    select 1 from public.comments c where c.id=new.parent_id and c.post_id=new.post_id
  ) then
    raise exception 'La réponse doit appartenir à la même publication que le commentaire parent.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tafa_validate_comment_parent on public.comments;
create trigger trg_tafa_validate_comment_parent
before insert or update of parent_id, post_id on public.comments
for each row execute function public.tafa_validate_comment_parent();

-- ============================================================
-- COMMENT LIKES: use SECURITY DEFINER RPC so RLS cannot block UI
-- ============================================================
alter table public.comment_likes enable row level security;
grant select on public.comment_likes to authenticated;
drop policy if exists "comment_likes_select_authenticated" on public.comment_likes;
create policy "comment_likes_select_authenticated" on public.comment_likes
for select to authenticated using (true);

drop policy if exists "comment_likes_insert_own" on public.comment_likes;
create policy "comment_likes_insert_own" on public.comment_likes
for insert to authenticated with check (user_id=auth.uid());

drop policy if exists "comment_likes_delete_own" on public.comment_likes;
create policy "comment_likes_delete_own" on public.comment_likes
for delete to authenticated using (user_id=auth.uid());

create unique index if not exists comment_likes_unique_user_comment
on public.comment_likes(comment_id,user_id);
create index if not exists comment_likes_comment_idx on public.comment_likes(comment_id);

-- Add a real source pointer for notifications.
alter table public.notifications add column if not exists comment_id uuid null;
create index if not exists notifications_user_created_idx
on public.notifications(user_id,created_at desc);
create index if not exists notifications_post_idx
on public.notifications(post_id);
create index if not exists notifications_comment_idx
on public.notifications(comment_id);

-- ============================================================
-- NOTIFICATIONS RLS
-- ============================================================
alter table public.notifications enable row level security;
grant select, update, delete on public.notifications to authenticated;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
for select to authenticated using (user_id=auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications
for delete to authenticated using (user_id=auth.uid());

-- 4-arg compatibility wrapper
create or replace function public.tafa_create_notification(
  p_user_id uuid,
  p_type text,
  p_message text,
  p_post_id uuid default null
)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if p_user_id is null or p_user_id=auth.uid() then return null; end if;
  insert into public.notifications(user_id,actor_id,type,post_id,comment_id,message,is_read,created_at)
  values(p_user_id,auth.uid(),coalesce(p_type,'activity'),p_post_id,null,coalesce(p_message,''),false,now())
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.tafa_create_notification(uuid,text,text,uuid) to authenticated;

-- 5-arg source-aware notification function
create or replace function public.tafa_create_notification(
  p_user_id uuid,
  p_type text,
  p_message text,
  p_post_id uuid,
  p_comment_id uuid
)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if p_user_id is null or p_user_id=auth.uid() then return null; end if;
  insert into public.notifications(user_id,actor_id,type,post_id,comment_id,message,is_read,created_at)
  values(p_user_id,auth.uid(),coalesce(p_type,'activity'),p_post_id,p_comment_id,coalesce(p_message,''),false,now())
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.tafa_create_notification(uuid,text,text,uuid,uuid) to authenticated;

-- ============================================================
-- COMMENT LIKE RPC + notification
-- ============================================================
create or replace function public.tafa_set_comment_like(
  p_comment_id uuid,
  p_like boolean
)
returns boolean
language plpgsql security definer set search_path=public as $$
declare
  uid uuid := auth.uid();
  v_post_id uuid;
  v_owner uuid;
  v_already boolean;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select c.post_id into v_post_id from public.comments c where c.id=p_comment_id;
  if v_post_id is null then raise exception 'Commentaire introuvable'; end if;

  select exists(select 1 from public.comment_likes where comment_id=p_comment_id and user_id=uid) into v_already;

  if p_like and not v_already then
    insert into public.comment_likes(comment_id,user_id,created_at)
    values(p_comment_id,uid,now())
    on conflict (comment_id,user_id) do nothing;

    select p.user_id into v_owner from public.posts p where p.id=v_post_id;
    if v_owner is not null and v_owner<>uid then
      insert into public.notifications(user_id,actor_id,type,post_id,comment_id,message,is_read,created_at)
      values(v_owner,uid,'comment_reaction',v_post_id,p_comment_id,'a réagi à un commentaire de votre publication.',false,now());
    end if;
  elsif not p_like and v_already then
    delete from public.comment_likes where comment_id=p_comment_id and user_id=uid;
  end if;
  return p_like;
end;
$$;

revoke all on function public.tafa_set_comment_like(uuid,boolean) from public;
grant execute on function public.tafa_set_comment_like(uuid,boolean) to authenticated;
-- ============================================================
-- POST REACTIONS: robust RPC + notification to publication owner
-- ============================================================
create or replace function public.tafa_set_post_reaction(
  p_post_id uuid,
  p_reaction text default null
)
returns table(reaction text)
language plpgsql security definer set search_path=public as $$
declare
  uid uuid := auth.uid();
  v_owner uuid;
  v_old text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select p.user_id into v_owner from public.posts p where p.id=p_post_id;
  if v_owner is null then raise exception 'Publication introuvable'; end if;

  select pr.reaction_type::text into v_old
  from public.post_reactions pr
  where pr.post_id=p_post_id and pr.user_id=uid;

  if p_reaction is null or btrim(p_reaction)='' then
    delete from public.post_reactions where post_id=p_post_id and user_id=uid;
    return;
  end if;

  insert into public.post_reactions(post_id,user_id,reaction_type)
  values(p_post_id,uid,p_reaction)
  on conflict (post_id,user_id) do update set reaction_type=excluded.reaction_type;

  if v_owner<>uid and coalesce(v_old,'')<>p_reaction then
    insert into public.notifications(user_id,actor_id,type,post_id,comment_id,message,is_read,created_at)
    values(v_owner,uid,'reaction',p_post_id,null,'a réagi à votre publication.',false,now());
  end if;

  return query select pr.reaction_type::text
  from public.post_reactions pr where pr.post_id=p_post_id and pr.user_id=uid;
end;
$$;

revoke all on function public.tafa_set_post_reaction(uuid,text) from public;
grant execute on function public.tafa_set_post_reaction(uuid,text) to authenticated;

-- ============================================================
-- COMMENT / REPLY notification trigger
-- ============================================================
create or replace function public.tafa_notify_new_comment()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_recipient uuid;
  v_actor_name text;
  v_message text;
  v_type text;
begin
  if new.parent_id is null then
    select p.user_id into v_recipient from public.posts p where p.id=new.post_id;
    v_type:='comment';
    v_message:='a commenté votre publication.';
  else
    select c.user_id into v_recipient from public.comments c where c.id=new.parent_id;
    v_type:='reply';
    v_message:='a répondu à votre commentaire.';
  end if;

  if v_recipient is null or v_recipient=new.user_id then return new; end if;

  select trim(concat_ws(' ',p.first_name,p.last_name)) into v_actor_name
  from public.profiles p where p.id=new.user_id;
  v_actor_name:=coalesce(nullif(v_actor_name,''),'Un utilisateur');

  insert into public.notifications(user_id,actor_id,type,post_id,comment_id,message,is_read,created_at)
  values(v_recipient,new.user_id,v_type,new.post_id,new.id,v_actor_name||' '||v_message,false,now());
  return new;
end;
$$;

drop trigger if exists trg_tafa_new_comment_notification on public.comments;
create trigger trg_tafa_new_comment_notification
after insert on public.comments
for each row execute function public.tafa_notify_new_comment();

-- ============================================================
-- REALTIME
-- ============================================================
do $$ begin alter publication supabase_realtime add table public.comments; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.comment_likes; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.post_reactions; exception when duplicate_object then null; end $$;

notify pgrst,'reload schema';
select 'TAFA V1.1.6 — COMMENTS + REACTIONS + CLICKABLE NOTIFICATIONS OK' as status;

-- ============================================================
-- POST SHARE notification (keeps existing counter behavior)
-- ============================================================
create or replace function public.tafa_increment_post_share(p_post_id uuid)
returns integer
language plpgsql security definer set search_path=public as $$
declare
  uid uuid := auth.uid();
  v_owner uuid;
  v_shares integer;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  select p.user_id,p.shares into v_owner,v_shares from public.posts p where p.id=p_post_id for update;
  if v_owner is null then raise exception 'Publication introuvable'; end if;
  v_shares:=coalesce(v_shares,0)+1;
  update public.posts set shares=v_shares,updated_at=now() where id=p_post_id;
  if v_owner<>uid then
    insert into public.notifications(user_id,actor_id,type,post_id,comment_id,message,is_read,created_at)
    values(v_owner,uid,'share',p_post_id,null,'a partagé votre publication.',false,now());
  end if;
  return v_shares;
end;
$$;
revoke all on function public.tafa_increment_post_share(uuid) from public;
grant execute on function public.tafa_increment_post_share(uuid) to authenticated;
