-- TAFAß V1.1.6.3 — FRIEND REQUESTS PERMISSION FIX
-- À exécuter une seule fois dans Supabase SQL Editor.
-- Cette correction règle « permission denied for table friend_requests ».

-- 1) Autoriser le rôle utilisé par Supabase Auth/PostgREST à accéder à la table.
grant select, insert, update, delete on table public.friend_requests to authenticated;

-- 2) Réactiver RLS et remplacer les policies par des policies compatibles.
alter table public.friend_requests enable row level security;

drop policy if exists "friend_requests_select_own" on public.friend_requests;
create policy "friend_requests_select_own"
on public.friend_requests
for select to authenticated
using (sender_id = auth.uid() or receiver_id = auth.uid());

drop policy if exists "friend_requests_insert_own" on public.friend_requests;
create policy "friend_requests_insert_own"
on public.friend_requests
for insert to authenticated
with check (sender_id = auth.uid() and sender_id <> receiver_id);

drop policy if exists "friend_requests_update_own" on public.friend_requests;
create policy "friend_requests_update_own"
on public.friend_requests
for update to authenticated
using (sender_id = auth.uid() or receiver_id = auth.uid())
with check (sender_id = auth.uid() or receiver_id = auth.uid());

drop policy if exists "friend_requests_update_receiver" on public.friend_requests;

-- Delete is kept for cancel/refuse flows.
drop policy if exists "friend_requests_delete_own" on public.friend_requests;
create policy "friend_requests_delete_own"
on public.friend_requests
for delete to authenticated
using (sender_id = auth.uid() or receiver_id = auth.uid());

-- Verify after execution:
-- select table_schema, table_name, privilege_type
-- from information_schema.role_table_grants
-- where table_schema='public' and table_name='friend_requests'
-- and grantee='authenticated';
