-- TAFAß / DIAGNOSTIC READ-ONLY
-- Tsy manova database ity fichier ity.
select column_name, data_type
from information_schema.columns
where table_schema='public' and table_name='posts'
order by ordinal_position;

select policyname, cmd, qual, with_check
from pg_policies
where schemaname='public' and tablename='posts'
order by policyname;

select id, name, public
from storage.buckets
where id='posts';
