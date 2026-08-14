-- TAFAß V1.1.5.9 — SCHEMA EXACT FIX
-- Based on the user's actual Supabase schema.
-- comments: id, post_id, user_id, content, text, created_at, updated_at, parent_id, edited_at
-- comment_likes: comment_id, user_id, created_at
-- notifications: id, user_id, actor_id, type, post_id, message, is_read, created_at
-- posts: id, user_id, content, media_url, media_type, visibility, created_at, updated_at, shares

create extension if not exists pgcrypto;

-- COMMENTS ----------------------------------------------------
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
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "comments_delete_own" on public.comments;
create policy "comments_delete_own" on public.comments
for delete to authenticated using (user_id = auth.uid());

-- Keep text and content synchronized. Both are NOT NULL in this schema.
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

-- COMMENT LIKES -----------------------------------------------
alter table public.comment_likes enable row level security;
grant select, insert, delete on public.comment_likes to authenticated;

drop policy if exists "comment_likes_select_authenticated" on public.comment_likes;
create policy "comment_likes_select_authenticated" on public.comment_likes
for select to authenticated using (true);

drop policy if exists "comment_likes_insert_own" on public.comment_likes;
create policy "comment_likes_insert_own" on public.comment_likes
for insert to authenticated
with check (
  user_id=auth.uid()
  and exists (select 1 from public.comments c where c.id=comment_id)
);

drop policy if exists "comment_likes_delete_own" on public.comment_likes;
create policy "comment_likes_delete_own" on public.comment_likes
for delete to authenticated using (user_id=auth.uid());

create index if not exists comment_likes_comment_idx on public.comment_likes(comment_id);

-- NOTIFICATIONS: USE ACTUAL COLUMNS ---------------------------
alter table public.notifications enable row level security;
grant select, update, delete on public.notifications to authenticated;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
for select to authenticated using (user_id=auth.uid());

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
for update to authenticated
using (user_id=auth.uid()) with check (user_id=auth.uid());

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications
for delete to authenticated using (user_id=auth.uid());

-- SECURITY DEFINER function: client does not need INSERT permission.
-- Exact existing notification schema: user_id, actor_id, type, post_id, message, is_read, created_at.
create or replace function public.tafa_create_notification(
  p_user_id uuid,
  p_type text,
  p_message text,
  p_post_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_id uuid;
begin
  if p_user_id is null or p_user_id=auth.uid() then return null; end if;
  insert into public.notifications(user_id,actor_id,type,post_id,message,is_read,created_at)
  values(p_user_id,auth.uid(),coalesce(p_type,'activity'),p_post_id,coalesce(p_message,''),false,now())
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.tafa_create_notification(uuid,text,text,uuid) to authenticated;

-- Automatic notification for comments and replies.
-- IMPORTANT: actual posts owner column is posts.user_id.
create or replace function public.tafa_notify_new_comment()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
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

  insert into public.notifications(user_id,actor_id,type,post_id,message,is_read,created_at)
  values(v_recipient,new.user_id,v_type,new.post_id,v_actor_name||' '||v_message,false,now());

  return new;
end;
$$;

drop trigger if exists trg_tafa_new_comment_notification on public.comments;
create trigger trg_tafa_new_comment_notification
after insert on public.comments
for each row execute function public.tafa_notify_new_comment();

-- REALTIME -----------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.comments;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.comment_likes;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;

notify pgrst,'reload schema';
select 'TAFA V1.1.5.9 — EXACT SCHEMA FIX OK' as status;
