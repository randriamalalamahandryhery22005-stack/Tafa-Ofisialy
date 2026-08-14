-- TAFAß V1.1.6.9 — STORIES
-- Compatible with Supabase Auth and existing friendships schema:
-- friendships(id, requester_id, receiver_id, status, created_at, updated_at)

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null default '',
  media_url text,
  media_type text not null default 'text' check (media_type in ('text','image','video')),
  visibility text not null default 'public' check (visibility in ('public','friends')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index if not exists stories_user_id_idx on public.stories(user_id);
create index if not exists stories_expires_at_idx on public.stories(expires_at desc);
create index if not exists stories_created_at_idx on public.stories(created_at desc);

create table if not exists public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

create table if not exists public.story_reactions (
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction_type text not null default '❤️',
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

create table if not exists public.story_replies (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists story_replies_story_id_idx on public.story_replies(story_id, created_at);

alter table public.stories enable row level security;
alter table public.story_views enable row level security;
alter table public.story_reactions enable row level security;
alter table public.story_replies enable row level security;

grant select, insert, update, delete on public.stories to authenticated;
grant select, insert, update, delete on public.story_views to authenticated;
grant select, insert, update, delete on public.story_reactions to authenticated;
grant select, insert, update, delete on public.story_replies to authenticated;

drop policy if exists "stories_select_visible" on public.stories;
create policy "stories_select_visible" on public.stories
for select to authenticated
using (
  user_id = auth.uid()
  or visibility = 'public'
  or exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = auth.uid() and f.receiver_id = stories.user_id)
        or (f.receiver_id = auth.uid() and f.requester_id = stories.user_id))
  )
);

drop policy if exists "stories_insert_own" on public.stories;
create policy "stories_insert_own" on public.stories
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "stories_update_own" on public.stories;
create policy "stories_update_own" on public.stories
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "stories_delete_own" on public.stories;
create policy "stories_delete_own" on public.stories
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists "story_views_select_visible" on public.story_views;
create policy "story_views_select_visible" on public.story_views
for select to authenticated
using (
  user_id = auth.uid()
  or exists (select 1 from public.stories s where s.id = story_views.story_id and s.user_id = auth.uid())
);

drop policy if exists "story_views_insert_own" on public.story_views;
create policy "story_views_insert_own" on public.story_views
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "story_views_update_own" on public.story_views;
create policy "story_views_update_own" on public.story_views
for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "story_views_delete_own" on public.story_views;
create policy "story_views_delete_own" on public.story_views
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists "story_reactions_select_visible" on public.story_reactions;
create policy "story_reactions_select_visible" on public.story_reactions
for select to authenticated
using (
  user_id = auth.uid()
  or exists (select 1 from public.stories s where s.id = story_reactions.story_id and s.user_id = auth.uid())
);

drop policy if exists "story_reactions_insert_own" on public.story_reactions;
create policy "story_reactions_insert_own" on public.story_reactions
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "story_reactions_update_own" on public.story_reactions;
create policy "story_reactions_update_own" on public.story_reactions
for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "story_reactions_delete_own" on public.story_reactions;
create policy "story_reactions_delete_own" on public.story_reactions
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists "story_replies_select_visible" on public.story_replies;
create policy "story_replies_select_visible" on public.story_replies
for select to authenticated
using (
  user_id = auth.uid()
  or exists (select 1 from public.stories s where s.id = story_replies.story_id and s.user_id = auth.uid())
);

drop policy if exists "story_replies_insert_own" on public.story_replies;
create policy "story_replies_insert_own" on public.story_replies
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "story_replies_update_own" on public.story_replies;
create policy "story_replies_update_own" on public.story_replies
for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "story_replies_delete_own" on public.story_replies;
create policy "story_replies_delete_own" on public.story_replies
for delete to authenticated
using (user_id = auth.uid());

-- Storage bucket for story media.
insert into storage.buckets (id, name, public)
values ('stories', 'stories', true)
on conflict (id) do update set public = true;

drop policy if exists "stories_storage_select" on storage.objects;
create policy "stories_storage_select" on storage.objects
for select to public
using (bucket_id = 'stories');

drop policy if exists "stories_storage_insert" on storage.objects;
create policy "stories_storage_insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'stories' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "stories_storage_update" on storage.objects;
create policy "stories_storage_update" on storage.objects
for update to authenticated
using (bucket_id = 'stories' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'stories' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "stories_storage_delete" on storage.objects;
create policy "stories_storage_delete" on storage.objects
for delete to authenticated
using (bucket_id = 'stories' and (storage.foldername(name))[1] = auth.uid()::text);
