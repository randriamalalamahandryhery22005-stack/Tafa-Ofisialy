-- TAFA V10 — Likes / Réactions + Commentaires + Partages
-- Exécuter une seule fois dans Supabase SQL Editor.
-- Ce patch ne modifie pas public.posts et ne remplace aucune policy existante.

grant select, insert, update, delete on table public.post_reactions to authenticated;
grant select, insert, update, delete on table public.comments to authenticated;

create table if not exists public.post_shares (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(post_id, user_id)
);

alter table public.post_shares enable row level security;

grant select, insert, delete on table public.post_shares to authenticated;

drop policy if exists "post_shares_select_authenticated" on public.post_shares;
create policy "post_shares_select_authenticated"
on public.post_shares for select to authenticated
using (true);

drop policy if exists "post_shares_insert_own" on public.post_shares;
create policy "post_shares_insert_own"
on public.post_shares for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "post_shares_delete_own" on public.post_shares;
create policy "post_shares_delete_own"
on public.post_shares for delete to authenticated
using (user_id = auth.uid());

-- Grants needed by the current client code for profile lookups used
-- when rendering authors/comments.
grant select on table public.profiles to authenticated;
