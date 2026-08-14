-- Tafa V1.1.6.17 — Storage & Media Security Audit
-- Diagnostic only: does NOT change buckets, objects, policies, or data.

-- 1) Buckets
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
ORDER BY name;

-- 2) Storage RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename IN ('objects','buckets')
ORDER BY tablename, policyname;

-- 3) Storage grants for anon/authenticated
SELECT grantee, table_name,
       string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'storage'
  AND grantee IN ('anon','authenticated')
GROUP BY grantee, table_name
ORDER BY table_name, grantee;

-- 4) Storage objects metadata (no file contents)
SELECT bucket_id, count(*) AS object_count
FROM storage.objects
GROUP BY bucket_id
ORDER BY bucket_id;

-- 5) Check whether object paths contain a user UUID segment.
SELECT bucket_id,
       count(*) FILTER (WHERE name ~* '(^|/)[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(/|$)') AS paths_with_uuid,
       count(*) AS total_objects
FROM storage.objects
GROUP BY bucket_id
ORDER BY bucket_id;
