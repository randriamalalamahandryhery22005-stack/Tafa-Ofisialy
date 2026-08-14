-- TAFAß — Messages Media / Files Storage
-- Run this ONCE in Supabase SQL Editor.

BEGIN;

-- Private messaging files are stored in a dedicated bucket.
-- The bucket is public so image/video/audio/file URLs used by the existing
-- message UI remain directly playable/downloadable in the browser.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('messages', 'messages', true, 104857600)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 104857600;

-- Remove only the policies belonging to this bucket implementation.
DROP POLICY IF EXISTS messages_storage_select ON storage.objects;
DROP POLICY IF EXISTS messages_storage_insert ON storage.objects;
DROP POLICY IF EXISTS messages_storage_update ON storage.objects;
DROP POLICY IF EXISTS messages_storage_delete ON storage.objects;
DROP POLICY IF EXISTS messages_media_select ON storage.objects;
DROP POLICY IF EXISTS messages_media_insert ON storage.objects;
DROP POLICY IF EXISTS messages_media_update ON storage.objects;
DROP POLICY IF EXISTS messages_media_delete ON storage.objects;

-- Authenticated users can read message media.
CREATE POLICY messages_media_select
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'messages');

-- Authenticated users can upload message media.
CREATE POLICY messages_media_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'messages'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Owner can replace/update files in their own folder.
CREATE POLICY messages_media_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'messages'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'messages'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Owner can delete files in their own folder.
CREATE POLICY messages_media_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'messages'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

COMMIT;

NOTIFY pgrst, 'reload schema';
