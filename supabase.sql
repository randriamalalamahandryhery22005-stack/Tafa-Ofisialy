-- TAFAß — ÉTAPE 1 : SUPABASE AUTH + PROFILS
-- À exécuter dans Supabase > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  birth date,
  gender text,
  username text unique,
  country text default 'Madagascar',
  phone_code text,
  phone text,
  email text,
  avatar_url text,
  cover_url text,
  bio text default '',
  location text default '',
  type text default 'account',
  verified boolean default false,
  followers integer not null default 0,
  following integer not null default 0,
  friends integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id, first_name, last_name, birth, gender, username,
    country, phone_code, phone, email, location
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name',''),
    coalesce(new.raw_user_meta_data->>'last_name',''),
    case
      when coalesce(new.raw_user_meta_data->>'birth','') <> ''
      then (new.raw_user_meta_data->>'birth')::date
      else null
    end,
    coalesce(new.raw_user_meta_data->>'gender',''),
    nullif(new.raw_user_meta_data->>'username',''),
    coalesce(new.raw_user_meta_data->>'country','Madagascar'),
    coalesce(new.raw_user_meta_data->>'phone_code',''),
    coalesce(new.raw_user_meta_data->>'phone',''),
    coalesce(new.email,''),
    coalesce(new.raw_user_meta_data->>'location','')
  )
  on conflict (id) do update set
    email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();


-- TAFAß — ÉTAPE 3 : PROFIL RÉEL + STORAGE
alter table public.profiles add column if not exists pseudo text default '';
alter table public.profiles add column if not exists relationship_status text default '';
alter table public.profiles add column if not exists privacy jsonb not null default '{}'::jsonb;

-- Bucket public pour les photos de profil/couverture.
insert into storage.buckets (id, name, public)
values ('profiles', 'profiles', true)
on conflict (id) do update set public = true;

drop policy if exists "profile_images_public_read" on storage.objects;
create policy "profile_images_public_read"
on storage.objects for select
to public
using (bucket_id = 'profiles');

drop policy if exists "profile_images_own_insert" on storage.objects;
create policy "profile_images_own_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profiles'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profile_images_own_update" on storage.objects;
create policy "profile_images_own_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'profiles'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profiles'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "profile_images_own_delete" on storage.objects;
create policy "profile_images_own_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profiles'
  and (storage.foldername(name))[1] = auth.uid()::text
);


-- TAFAß — ÉTAPE 4 : PUBLICATIONS, RÉACTIONS ET COMMENTAIRES RÉELS

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text default 'Publication',
  text text default '',
  media_url text default '',
  media_type text default 'text',
  visibility text not null default 'Public',
  allowed_users uuid[] not null default '{}',
  tags text[] not null default '{}',
  shares integer not null default 0,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

alter table public.posts enable row level security;

drop policy if exists "posts_select_authenticated" on public.posts;
drop policy if exists "posts_select_friends" on public.posts;
create policy "posts_select_authenticated" on public.posts
for select to authenticated using (
  visibility = 'Public'
  or owner_id = auth.uid()
  or (auth.uid() = any(allowed_users))
  or (
    visibility = 'Amis'
    and exists (
      select 1 from public.friendships f
      where (f.user_id = auth.uid() and f.friend_id = owner_id)
         or (f.friend_id = auth.uid() and f.user_id = owner_id)
    )
  )
);

drop policy if exists "posts_insert_own" on public.posts;
create policy "posts_insert_own" on public.posts
for insert to authenticated
with check (owner_id = auth.uid());

drop policy if exists "posts_update_own" on public.posts;
create policy "posts_update_own" on public.posts
for update to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "posts_delete_own" on public.posts;
create policy "posts_delete_own" on public.posts
for delete to authenticated using (owner_id = auth.uid());

create table if not exists public.post_reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null,
  created_at timestamptz not null default now(),
  primary key (post_id,user_id)
);

alter table public.post_reactions enable row level security;

drop policy if exists "post_reactions_select_authenticated" on public.post_reactions;
create policy "post_reactions_select_authenticated" on public.post_reactions
for select to authenticated using (true);

drop policy if exists "post_reactions_insert_own" on public.post_reactions;
create policy "post_reactions_insert_own" on public.post_reactions
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "post_reactions_update_own" on public.post_reactions;
create policy "post_reactions_update_own" on public.post_reactions
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "post_reactions_delete_own" on public.post_reactions;
create policy "post_reactions_delete_own" on public.post_reactions
for delete to authenticated using (user_id = auth.uid());

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

alter table public.comments enable row level security;

drop policy if exists "comments_select_authenticated" on public.comments;
create policy "comments_select_authenticated" on public.comments
for select to authenticated using (true);

drop policy if exists "comments_insert_own" on public.comments;
create policy "comments_insert_own" on public.comments
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "comments_update_own" on public.comments;
create policy "comments_update_own" on public.comments
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "comments_delete_own" on public.comments;
create policy "comments_delete_own" on public.comments
for delete to authenticated using (user_id = auth.uid());

-- Storage bucket pour les médias des publications.
insert into storage.buckets (id,name,public)
values ('posts','posts',true)
on conflict (id) do update set public=true;

drop policy if exists "posts_media_public_read" on storage.objects;
create policy "posts_media_public_read" on storage.objects
for select using (bucket_id='posts');

drop policy if exists "posts_media_own_insert" on storage.objects;
create policy "posts_media_own_insert" on storage.objects
for insert to authenticated
with check (bucket_id='posts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "posts_media_own_update" on storage.objects;
create policy "posts_media_own_update" on storage.objects
for update to authenticated
using (bucket_id='posts' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id='posts' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "posts_media_own_delete" on storage.objects;
create policy "posts_media_own_delete" on storage.objects
for delete to authenticated
using (bucket_id='posts' and (storage.foldername(name))[1] = auth.uid()::text);

create index if not exists posts_created_at_idx on public.posts(created_at desc);
create index if not exists posts_owner_id_idx on public.posts(owner_id);
create index if not exists friendships_user_friend_idx on public.friendships(user_id, friend_id);
create index if not exists posts_visibility_idx on public.posts(visibility);
create index if not exists comments_post_id_idx on public.comments(post_id);

-- ============================================================
-- TAFAß — ÉTAPE 5 : SOCIAL CORE
-- Amis / Invitations / Follows / Notifications
-- ============================================================

-- ------------------------------------------------------------
-- 1. FRIEND REQUESTS
-- ------------------------------------------------------------

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique(sender_id, receiver_id)
);

alter table public.friend_requests enable row level security;

drop policy if exists "friend_requests_select_own" on public.friend_requests;
create policy "friend_requests_select_own"
on public.friend_requests
for select to authenticated
using (
  sender_id = auth.uid()
  or receiver_id = auth.uid()
);

drop policy if exists "friend_requests_insert_own" on public.friend_requests;
create policy "friend_requests_insert_own"
on public.friend_requests
for insert to authenticated
with check (
  sender_id = auth.uid()
  and sender_id <> receiver_id
);

drop policy if exists "friend_requests_update_receiver" on public.friend_requests;
create policy "friend_requests_update_receiver"
on public.friend_requests
for update to authenticated
using (
  receiver_id = auth.uid()
  or sender_id = auth.uid()
)
with check (
  receiver_id = auth.uid()
  or sender_id = auth.uid()
);

drop policy if exists "friend_requests_delete_own" on public.friend_requests;
create policy "friend_requests_delete_own"
on public.friend_requests
for delete to authenticated
using (
  sender_id = auth.uid()
  or receiver_id = auth.uid()
);


-- ------------------------------------------------------------
-- 2. FRIENDSHIPS
-- ------------------------------------------------------------

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_id <> friend_id),
  unique(user_id, friend_id)
);

alter table public.friendships enable row level security;

drop policy if exists "friendships_select_own" on public.friendships;
create policy "friendships_select_own"
on public.friendships
for select to authenticated
using (
  user_id = auth.uid()
  or friend_id = auth.uid()
);

drop policy if exists "friendships_insert_own" on public.friendships;
create policy "friendships_insert_own"
on public.friendships
for insert to authenticated
with check (
  user_id = auth.uid()
);

drop policy if exists "friendships_delete_own" on public.friendships;
create policy "friendships_delete_own"
on public.friendships
for delete to authenticated
using (
  user_id = auth.uid()
  or friend_id = auth.uid()
);


-- ------------------------------------------------------------
-- 3. FOLLOWS
-- ------------------------------------------------------------

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

alter table public.follows enable row level security;

drop policy if exists "follows_select_authenticated" on public.follows;
create policy "follows_select_authenticated"
on public.follows
for select to authenticated
using (true);

drop policy if exists "follows_insert_own" on public.follows;
create policy "follows_insert_own"
on public.follows
for insert to authenticated
with check (
  follower_id = auth.uid()
);

drop policy if exists "follows_delete_own" on public.follows;
create policy "follows_delete_own"
on public.follows
for delete to authenticated
using (
  follower_id = auth.uid()
);


-- ------------------------------------------------------------
-- 4. NOTIFICATIONS
-- ------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),

  recipient_id uuid not null
    references public.profiles(id)
    on delete cascade,

  actor_id uuid
    references public.profiles(id)
    on delete set null,

  type text not null,

  title text not null default '',
  message text not null default '',

  entity_type text default '',
  entity_id uuid,

  is_read boolean not null default false,

  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
on public.notifications
for select to authenticated
using (
  recipient_id = auth.uid()
);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
on public.notifications
for update to authenticated
using (
  recipient_id = auth.uid()
)
with check (
  recipient_id = auth.uid()
);

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own"
on public.notifications
for delete to authenticated
using (
  recipient_id = auth.uid()
);


-- ------------------------------------------------------------
-- 5. INDEXES
-- ------------------------------------------------------------

create index if not exists friend_requests_receiver_idx
on public.friend_requests(receiver_id, status);

create index if not exists friend_requests_sender_idx
on public.friend_requests(sender_id, status);

create index if not exists friendships_user_idx
on public.friendships(user_id);

create index if not exists friendships_friend_idx
on public.friendships(friend_id);

create index if not exists follows_follower_idx
on public.follows(follower_id);

create index if not exists follows_following_idx
on public.follows(following_id);

create index if not exists notifications_recipient_idx
on public.notifications(recipient_id, created_at desc);

create index if not exists notifications_unread_idx
on public.notifications(recipient_id, is_read);


-- ============================================================
-- 6. FUNCTIONS
-- ============================================================

-- Accept friend request and create the two friendship rows.
create or replace function public.accept_friend_request(
  request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.friend_requests;
begin

  select *
  into req
  from public.friend_requests
  where id = request_id
    and receiver_id = auth.uid()
    and status = 'pending'
  for update;

  if not found then
    return false;
  end if;


-- TAFAß V9 — PHOTO / VIDÉO / REEL + SUPABASE STORAGE
-- À exécuter UNE FOIS dans Supabase > SQL Editor.
-- Ce script ne modifie pas les RLS de public.posts.

-- Bucket public: les fichiers peuvent être lus via getPublicUrl().
insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'posts',
  'posts',
  true,
  104857600,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-matroska'
  ]::text[]
)
on conflict (id) do update set
  public = true,
  file_size_limit = 104857600,
  allowed_mime_types = excluded.allowed_mime_types;

-- Lecture publique des médias du bucket posts.
drop policy if exists "posts_media_public_read" on storage.objects;
create policy "posts_media_public_read"
on storage.objects
for select
to public
using (bucket_id = 'posts');

-- Un utilisateur connecté ne peut envoyer que dans son propre dossier:
-- posts/<auth.uid()>/<uuid>.<extension>
drop policy if exists "posts_media_own_insert" on storage.objects;
create policy "posts_media_own_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'posts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Modification uniquement des fichiers appartenant à l'utilisateur.
drop policy if exists "posts_media_own_update" on storage.objects;
create policy "posts_media_own_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'posts'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'posts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Suppression uniquement des fichiers appartenant à l'utilisateur.
drop policy if exists "posts_media_own_delete" on storage.objects;
create policy "posts_media_own_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'posts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Vérification rapide:
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'posts';
