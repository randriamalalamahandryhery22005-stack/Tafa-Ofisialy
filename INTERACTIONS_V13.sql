-- TAFA V13 — Live interactions verification
-- IMPORTANT: The live database uses post_reactions.reaction_type.
-- This file is intentionally non-destructive. The V13 frontend reads
-- reaction_type and continues to use the already-working RPC functions.

select
  table_name,
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in ('post_reactions', 'comments', 'posts')
order by table_name, ordinal_position;

select
  routine_name,
  routine_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in ('tafa_set_post_reaction', 'tafa_increment_post_share')
order by routine_name;

select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles
from pg_policies
where schemaname = 'public'
  and tablename in ('post_reactions', 'comments', 'posts')
order by tablename, policyname;

-- Expected live reaction column:
-- public.post_reactions.reaction_type
