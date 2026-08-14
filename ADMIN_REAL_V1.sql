-- TAFAß — ADMINISTRATION RÉELLE SUPABASE V1
-- Exécuter UNE FOIS dans Supabase > SQL Editor.
-- Ce module ajoute uniquement la couche d'administration sécurisée.
-- Il ne remplace ni ne modifie les tables Realtime existantes.

create table if not exists public.tafa_admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin','super_admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tafa_admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  target_type text,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.tafa_admin_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null,
  target_id uuid not null,
  reason text not null default 'Autre',
  details text not null default '',
  status text not null default 'pending' check (status in ('pending','reviewed','resolved','dismissed')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists tafa_admin_reports_status_idx on public.tafa_admin_reports(status, created_at desc);
create index if not exists tafa_admin_reports_target_idx on public.tafa_admin_reports(target_type, target_id);
create index if not exists tafa_admin_audit_created_idx on public.tafa_admin_audit_logs(created_at desc);

alter table public.profiles add column if not exists account_status text not null default 'active';
alter table public.profiles add column if not exists privacy jsonb not null default '{}'::jsonb;

alter table public.tafa_admin_roles enable row level security;
alter table public.tafa_admin_audit_logs enable row level security;
alter table public.tafa_admin_reports enable row level security;

-- No direct client access to the admin role/audit tables.
drop policy if exists tafa_admin_roles_no_direct_select on public.tafa_admin_roles;
create policy tafa_admin_roles_no_direct_select on public.tafa_admin_roles for select to authenticated using (false);
drop policy if exists tafa_admin_audit_no_direct_select on public.tafa_admin_audit_logs;
create policy tafa_admin_audit_no_direct_select on public.tafa_admin_audit_logs for select to authenticated using (false);

-- Users can create reports only for themselves. Admins read/manage reports through RPCs.
drop policy if exists tafa_reports_insert_own on public.tafa_admin_reports;
create policy tafa_reports_insert_own on public.tafa_admin_reports
for insert to authenticated
with check (reporter_id = auth.uid());
drop policy if exists tafa_reports_select_own on public.tafa_admin_reports;
create policy tafa_reports_select_own on public.tafa_admin_reports
for select to authenticated
using (reporter_id = auth.uid());

-- ============================================================
-- SECURITY HELPERS
-- ============================================================
create or replace function public.tafa_is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tafa_admin_roles r
    where r.user_id = p_user_id
      and r.is_active = true
  );
$$;

revoke all on function public.tafa_is_admin(uuid) from public;
grant execute on function public.tafa_is_admin(uuid) to authenticated;

-- First bootstrap: only the verified Auth account using the official Tafaß
-- email can claim the initial admin role. Change the email here only if the
-- official Auth account email is intentionally different.
create or replace function public.tafa_bootstrap_official_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  mail text;
  confirmed boolean;
begin
  if uid is null then raise exception 'SESSION_REQUIRED'; end if;
  select lower(email), (email_confirmed_at is not null)
    into mail, confirmed
  from auth.users where id = uid;

  if mail <> 'tafabofisialy@gmail.com' then
    raise exception 'OFFICIAL_ADMIN_EMAIL_REQUIRED';
  end if;
  if not confirmed then
    raise exception 'ADMIN_EMAIL_NOT_CONFIRMED';
  end if;

  insert into public.tafa_admin_roles(user_id, role, is_active)
  values(uid, 'super_admin', true)
  on conflict(user_id) do update set is_active=true, role='super_admin', updated_at=now();

  return true;
end;
$$;

revoke all on function public.tafa_bootstrap_official_admin() from public;
grant execute on function public.tafa_bootstrap_official_admin() to authenticated;

-- ============================================================
-- REAL ADMIN DASHBOARD SNAPSHOT
-- ============================================================
create or replace function public.tafa_admin_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.tafa_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;

  select jsonb_build_object(
    'counts', jsonb_build_object(
      'users', (select count(*) from public.profiles),
      'active_users', (select count(*) from public.profiles where coalesce(account_status,'active')='active'),
      'banned_users', (select count(*) from public.profiles where coalesce(account_status,'active')='banned'),
      'verified_users', (select count(*) from public.profiles where verified=true),
      'pages', case when to_regclass('public.pages') is not null then (select count(*) from public.pages) else 0 end,
      'groups', case when to_regclass('public.groups') is not null then (select count(*) from public.groups) else 0 end,
      'posts', case when to_regclass('public.posts') is not null then (select count(*) from public.posts) else 0 end,
      'comments', case when to_regclass('public.comments') is not null then (select count(*) from public.comments) else 0 end,
      'messages', case when to_regclass('public.messages') is not null then (select count(*) from public.messages) else 0 end,
      'reports_pending', (select count(*) from public.tafa_admin_reports where status='pending')
    ),
    'users', coalesce((select jsonb_agg(to_jsonb(u) order by u.created_at desc) from (select id,first_name,last_name,username,email,avatar_url,verified,account_status,created_at from public.profiles order by created_at desc limit 300) u),'[]'::jsonb),
    'pages', case when to_regclass('public.pages') is not null then coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc) from (select id,owner_id,name,username,category,verified,created_at from public.pages order by created_at desc limit 300) p),'[]'::jsonb) else '[]'::jsonb end,
    'groups', case when to_regclass('public.groups') is not null then coalesce((select jsonb_agg(to_jsonb(g) order by g.created_at desc) from (select id,owner_id,name,category,privacy,member_count,created_at from public.groups order by created_at desc limit 300) g),'[]'::jsonb) else '[]'::jsonb end,
    'posts', case when to_regclass('public.posts') is not null then coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc) from (select id,owner_id,title,text,media_type,visibility,created_at from public.posts order by created_at desc limit 300) p),'[]'::jsonb) else '[]'::jsonb end,
    'comments', case when to_regclass('public.comments') is not null then coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc) from (select id,post_id,user_id,text,created_at from public.comments order by created_at desc limit 300) c),'[]'::jsonb) else '[]'::jsonb end,
    'reports', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from (select id,reporter_id,target_type,target_id,reason,details,status,reviewed_at,created_at from public.tafa_admin_reports order by created_at desc limit 300) r),'[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.tafa_admin_dashboard() from public;
grant execute on function public.tafa_admin_dashboard() to authenticated;

-- ============================================================
-- REAL ADMIN ACTIONS
-- ============================================================
create or replace function public.tafa_admin_set_user_status(p_user_id uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.tafa_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_user_id = auth.uid() then raise exception 'CANNOT_CHANGE_OWN_STATUS'; end if;
  if p_status not in ('active','banned','suspended') then raise exception 'INVALID_STATUS'; end if;
  update public.profiles set account_status=p_status where id=p_user_id;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  insert into public.tafa_admin_audit_logs(admin_id,action,target_type,target_id,details)
  values(auth.uid(),'set_user_status','user',p_user_id,jsonb_build_object('status',p_status));
  return true;
end;
$$;

create or replace function public.tafa_admin_delete_post(p_post_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.tafa_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  delete from public.posts where id=p_post_id;
  if not found then return false; end if;
  insert into public.tafa_admin_audit_logs(admin_id,action,target_type,target_id)
  values(auth.uid(),'delete','post',p_post_id);
  return true;
end;
$$;

create or replace function public.tafa_admin_delete_comment(p_comment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.tafa_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  delete from public.comments where id=p_comment_id;
  if not found then return false; end if;
  insert into public.tafa_admin_audit_logs(admin_id,action,target_type,target_id)
  values(auth.uid(),'delete','comment',p_comment_id);
  return true;
end;
$$;

create or replace function public.tafa_admin_delete_page(p_page_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.tafa_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  delete from public.pages where id=p_page_id;
  if not found then return false; end if;
  insert into public.tafa_admin_audit_logs(admin_id,action,target_type,target_id)
  values(auth.uid(),'delete','page',p_page_id);
  return true;
end;
$$;

create or replace function public.tafa_admin_delete_group(p_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.tafa_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  delete from public.groups where id=p_group_id;
  if not found then return false; end if;
  insert into public.tafa_admin_audit_logs(admin_id,action,target_type,target_id)
  values(auth.uid(),'delete','group',p_group_id);
  return true;
end;
$$;

create or replace function public.tafa_admin_delete_user(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  exists_user boolean;
begin
  if not public.tafa_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_user_id = auth.uid() then raise exception 'CANNOT_DELETE_SELF'; end if;
  select exists(select 1 from public.profiles where id=p_user_id) into exists_user;
  if not exists_user then return false; end if;
  insert into public.tafa_admin_audit_logs(admin_id,action,target_type,target_id)
  values(auth.uid(),'delete','user',p_user_id);
  delete from public.profiles where id=p_user_id;
  delete from auth.users where id=p_user_id;
  return true;
end;
$$;

create or replace function public.tafa_admin_report(p_target_type text, p_target_id uuid, p_reason text, p_details text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare rid uuid;
begin
  if auth.uid() is null then raise exception 'SESSION_REQUIRED'; end if;
  insert into public.tafa_admin_reports(reporter_id,target_type,target_id,reason,details)
  values(auth.uid(),p_target_type,p_target_id,coalesce(nullif(p_reason,''),'Autre'),coalesce(p_details,''))
  returning id into rid;
  return rid;
end;
$$;

create or replace function public.tafa_admin_resolve_report(p_report_id uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.tafa_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if p_status not in ('reviewed','resolved','dismissed','pending') then raise exception 'INVALID_REPORT_STATUS'; end if;
  update public.tafa_admin_reports set status=p_status, reviewed_by=auth.uid(), reviewed_at=now() where id=p_report_id;
  if not found then return false; end if;
  insert into public.tafa_admin_audit_logs(admin_id,action,target_type,target_id,details)
  values(auth.uid(),'resolve_report','report',p_report_id,jsonb_build_object('status',p_status));
  return true;
end;
$$;

revoke all on function public.tafa_admin_set_user_status(uuid,text) from public;
revoke all on function public.tafa_admin_delete_post(uuid) from public;
revoke all on function public.tafa_admin_delete_comment(uuid) from public;
revoke all on function public.tafa_admin_delete_page(uuid) from public;
revoke all on function public.tafa_admin_delete_group(uuid) from public;
revoke all on function public.tafa_admin_delete_user(uuid) from public;
revoke all on function public.tafa_admin_report(text,uuid,text,text) from public;
revoke all on function public.tafa_admin_resolve_report(uuid,text) from public;

grant execute on function public.tafa_admin_set_user_status(uuid,text) to authenticated;
grant execute on function public.tafa_admin_delete_post(uuid) to authenticated;
grant execute on function public.tafa_admin_delete_comment(uuid) to authenticated;
grant execute on function public.tafa_admin_delete_page(uuid) to authenticated;
grant execute on function public.tafa_admin_delete_group(uuid) to authenticated;
grant execute on function public.tafa_admin_delete_user(uuid) to authenticated;
grant execute on function public.tafa_admin_report(text,uuid,text,text) to authenticated;
grant execute on function public.tafa_admin_resolve_report(uuid,text) to authenticated;

comment on table public.tafa_admin_roles is 'Tafaß: serveur de vérité du rôle administrateur.';
comment on function public.tafa_is_admin(uuid) is 'Tafaß: vérifie le rôle admin côté serveur.';
