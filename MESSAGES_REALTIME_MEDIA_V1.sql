-- TAFAß V19 — REAL MESSAGES MEDIA / VOICE / FILES / REALTIME CALL SIGNALING
-- Run once in Supabase SQL Editor.

-- 1) Storage bucket for private-message attachments.
insert into storage.buckets (id, name, public)
values ('messages', 'messages', true)
on conflict (id) do update set public = true;

-- 2) Storage policies: authenticated users can upload/read/delete their own message files.
drop policy if exists "messages_storage_insert" on storage.objects;
drop policy if exists "messages_storage_select" on storage.objects;
drop policy if exists "messages_storage_delete" on storage.objects;

create policy "messages_storage_insert"
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'messages'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "messages_storage_select"
on storage.objects
for select to authenticated
using (bucket_id = 'messages');

create policy "messages_storage_delete"
on storage.objects
for delete to authenticated
using (
  bucket_id = 'messages'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 3) Realtime publication for messages/conversations if not already present.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
end $$;

-- 4) Ensure authenticated users can insert message rows with media metadata.
grant insert, select, update on public.messages to authenticated;

-- 5) Verify.
select id, name, public
from storage.buckets
where id = 'messages';

select tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in ('messages','conversations')
order by tablename;
