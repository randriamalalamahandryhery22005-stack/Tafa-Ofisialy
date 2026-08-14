SELECT table_name
FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN ('pages','page_followers','groups','group_members','group_join_requests')
ORDER BY table_name;

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname='public'
  AND tablename IN ('pages','page_followers','groups','group_members','group_join_requests','posts')
ORDER BY tablename;

SELECT tablename
FROM pg_publication_tables
WHERE pubname='supabase_realtime'
  AND schemaname='public'
  AND tablename IN ('pages','page_followers','groups','group_members','group_join_requests')
ORDER BY tablename;

SELECT column_name,data_type
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name='posts'
  AND column_name IN ('owner_id','user_id','publisher_page_id','group_id')
ORDER BY column_name;
