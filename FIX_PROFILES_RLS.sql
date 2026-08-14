-- Already applied if you received "Success. No rows returned".
-- Only run this if profiles SELECT is still denied:
alter table public.profiles enable row level security;
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles
for select
to authenticated
using (true);
