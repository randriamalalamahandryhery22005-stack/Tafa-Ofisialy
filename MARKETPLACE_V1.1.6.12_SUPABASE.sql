-- Tafaß Marketplace V1.1.6.12
-- Supabase schema + RLS + Storage + Realtime

create table if not exists public.marketplace_listings (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'Produit',
  title text not null,
  price text,
  description text not null default '',
  location text not null default 'Madagascar',
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists marketplace_listings_owner_idx
  on public.marketplace_listings(owner_id);
create index if not exists marketplace_listings_created_idx
  on public.marketplace_listings(created_at desc);

alter table public.marketplace_listings enable row level security;

-- Public marketplace listings can be read by authenticated users.
drop policy if exists marketplace_listings_select on public.marketplace_listings;
create policy marketplace_listings_select
on public.marketplace_listings
for select
to authenticated
using (true);

-- A user can only create an announcement for their own account.
drop policy if exists marketplace_listings_insert on public.marketplace_listings;
create policy marketplace_listings_insert
on public.marketplace_listings
for insert
 to authenticated
with check (owner_id = auth.uid());

-- Only the owner can edit/delete their announcement.
drop policy if exists marketplace_listings_update on public.marketplace_listings;
create policy marketplace_listings_update
on public.marketplace_listings
for update
 to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists marketplace_listings_delete on public.marketplace_listings;
create policy marketplace_listings_delete
on public.marketplace_listings
for delete
 to authenticated
using (owner_id = auth.uid());

-- Keep updated_at current.
create or replace function public.tafa_marketplace_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists marketplace_listings_updated_at on public.marketplace_listings;
create trigger marketplace_listings_updated_at
before update on public.marketplace_listings
for each row execute function public.tafa_marketplace_touch_updated_at();

-- Storage bucket for marketplace photos.
insert into storage.buckets (id, name, public)
values ('marketplace', 'marketplace', true)
on conflict (id) do update set public = true;

-- Authenticated users may read public marketplace images.
drop policy if exists marketplace_storage_select on storage.objects;
create policy marketplace_storage_select
on storage.objects
for select
to authenticated
using (bucket_id = 'marketplace');

-- Files must be stored under the authenticated user's UUID folder.
drop policy if exists marketplace_storage_insert on storage.objects;
create policy marketplace_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'marketplace'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists marketplace_storage_update on storage.objects;
create policy marketplace_storage_update
on storage.objects
for update
 to authenticated
using (
  bucket_id = 'marketplace'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'marketplace'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists marketplace_storage_delete on storage.objects;
create policy marketplace_storage_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'marketplace'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Realtime: add only if not already present.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'marketplace_listings'
  ) then
    alter publication supabase_realtime add table public.marketplace_listings;
  end if;
exception when undefined_object then
  null;
end $$;

notify pgrst, 'reload schema';
