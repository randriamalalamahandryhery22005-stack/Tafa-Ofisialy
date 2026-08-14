-- TAFA V14 diagnostic only. No schema changes are required.
select table_name, column_name, data_type
from information_schema.columns
where table_schema='public'
  and table_name in ('posts','post_reactions','comments')
order by table_name, ordinal_position;

select routine_name, routine_type
from information_schema.routines
where routine_schema='public'
  and routine_name in ('tafa_set_post_reaction','tafa_add_comment','tafa_increment_post_share')
order by routine_name;
