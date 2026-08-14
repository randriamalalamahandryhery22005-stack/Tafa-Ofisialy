-- TAFA V15 — Notifications persistence
-- Run once in Supabase SQL Editor. Non-destructive.

create or replace function public.tafa_create_notification(
  p_recipient_id uuid,
  p_type text,
  p_title text default '',
  p_message text default '',
  p_entity_type text default '',
  p_entity_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Utilisateur non connecté';
  end if;

  if p_recipient_id is null or p_recipient_id = auth.uid() then
    return null;
  end if;

  insert into public.notifications(
    recipient_id, actor_id, type, title, message,
    entity_type, entity_id, is_read, created_at
  )
  values(
    p_recipient_id, auth.uid(), coalesce(p_type,'activity'),
    coalesce(p_title,''), coalesce(p_message,''),
    coalesce(p_entity_type,''), p_entity_id, false, now()
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.tafa_create_notification(uuid,text,text,text,text,uuid)
to authenticated;

create index if not exists notifications_recipient_created_idx
on public.notifications(recipient_id, created_at desc);

-- Optional server-side notifications for reactions/comments/shares.
-- These blocks are intentionally defensive and only run if the tables/functions exist.
