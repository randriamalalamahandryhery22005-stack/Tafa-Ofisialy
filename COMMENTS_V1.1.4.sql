-- ============================================================
-- TAFAß V1.1.4 — GESTION DES COMMENTAIRES
-- À exécuter dans Supabase > SQL Editor après le schéma principal.
--
-- Inclus:
-- 1) commentaires CRUD sécurisés par RLS
-- 2) likes persistants des commentaires
-- 3) notification automatique au propriétaire de la publication
-- 4) index + Realtime
-- 5) aucune réponse imbriquée dans l'interface V1.1.4
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. COMMENTS — schema compatible avec le frontend V1.1.4
-- ------------------------------------------------------------
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

-- Anciennes versions peuvent avoir utilisé content/body.
-- On conserve text comme colonne canonique.
alter table public.comments add column if not exists text text;

-- Si une ancienne colonne content existe, récupérer ses données.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='comments' and column_name='content'
  ) then
    update public.comments
    set text = coalesce(nullif(text,''), content)
    where text is null or btrim(text) = '';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='comments' and column_name='body'
  ) then
    update public.comments
    set text = coalesce(nullif(text,''), body)
    where text is null or btrim(text) = '';
  end if;
end $$;

update public.comments set text='' where text is null;
alter table public.comments alter column text set not null;

alter table public.comments enable row level security;

drop policy if exists "comments_select_authenticated" on public.comments;
create policy "comments_select_authenticated"
on public.comments for select
to authenticated
using (true);

drop policy if exists "comments_insert_own" on public.comments;
create policy "comments_insert_own"
on public.comments for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (select 1 from public.posts p where p.id = post_id)
);

drop policy if exists "comments_update_own" on public.comments;
create policy "comments_update_own"
on public.comments for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "comments_delete_own" on public.comments;
create policy "comments_delete_own"
on public.comments for delete
to authenticated
using (user_id = auth.uid());

-- ------------------------------------------------------------
-- 2. COMMENT LIKES
-- ------------------------------------------------------------
create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

alter table public.comment_likes enable row level security;

drop policy if exists "comment_likes_select_authenticated" on public.comment_likes;
create policy "comment_likes_select_authenticated"
on public.comment_likes for select
to authenticated
using (true);

drop policy if exists "comment_likes_insert_own" on public.comment_likes;
create policy "comment_likes_insert_own"
on public.comment_likes for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "comment_likes_delete_own" on public.comment_likes;
create policy "comment_likes_delete_own"
on public.comment_likes for delete
to authenticated
using (user_id = auth.uid());

-- ------------------------------------------------------------
-- 3. NOTIFICATION — nouveau commentaire
-- ------------------------------------------------------------
create or replace function public.tafa_notify_new_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid;
  v_actor_name text;
  v_message text;
begin
  select p.owner_id into v_recipient
  from public.posts p
  where p.id = NEW.post_id;

  if v_recipient is null or v_recipient = NEW.user_id then
    return NEW;
  end if;

  select trim(concat_ws(' ', pr.first_name, pr.last_name))
  into v_actor_name
  from public.profiles pr
  where pr.id = NEW.user_id;

  v_actor_name := coalesce(nullif(v_actor_name,''),'Un utilisateur');
  v_message := v_actor_name || ' a commenté votre publication.';

  insert into public.notifications(
    recipient_id, actor_id, type, title, message,
    entity_type, entity_id, is_read, created_at
  )
  values(
    v_recipient, NEW.user_id, 'comment', 'Nouveau commentaire',
    v_message, 'post', NEW.post_id, false, now()
  );

  return NEW;
end;
$$;

drop trigger if exists trg_tafa_new_comment_notification on public.comments;
create trigger trg_tafa_new_comment_notification
after insert on public.comments
for each row execute function public.tafa_notify_new_comment();

revoke all on function public.tafa_notify_new_comment() from public;
grant execute on function public.tafa_notify_new_comment() to authenticated;

-- ------------------------------------------------------------
-- 4. INDEXES
-- ------------------------------------------------------------
create index if not exists comments_post_created_idx
on public.comments(post_id, created_at asc);

create index if not exists comments_user_idx
on public.comments(user_id);

create index if not exists comment_likes_comment_idx
on public.comment_likes(comment_id);

-- ------------------------------------------------------------
-- 5. REALTIME
-- ------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.comments;
exception when duplicate_object then
  null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.comment_likes;
exception when duplicate_object then
  null;
end $$;

notify pgrst, 'reload schema';

select 'TAFA V1.1.4 — commentaires OK' as status;
