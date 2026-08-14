-- TAFAß V9 — PHOTO / VIDÉO / REEL + SUPABASE STORAGE
-- À exécuter UNE FOIS dans Supabase > SQL Editor.
-- Ce script ne modifie pas les RLS de public.posts.

-- Bucket public: les fichiers peuvent être lus via getPublicUrl().
insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'posts',
  'posts',
  true,
  104857600,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-matroska'
  ]::text[]
)
on conflict (id) do update set
  public = true,
  file_size_limit = 104857600,
  allowed_mime_types = excluded.allowed_mime_types;

-- Lecture publique des médias du bucket posts.
drop policy if exists "posts_media_public_read" on storage.objects;
create policy "posts_media_public_read"
on storage.objects
for select
to public
using (bucket_id = 'posts');

-- Un utilisateur connecté ne peut envoyer que dans son propre dossier:
-- posts/<auth.uid()>/<uuid>.<extension>
drop policy if exists "posts_media_own_insert" on storage.objects;
create policy "posts_media_own_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'posts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Modification uniquement des fichiers appartenant à l'utilisateur.
drop policy if exists "posts_media_own_update" on storage.objects;
create policy "posts_media_own_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'posts'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'posts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Suppression uniquement des fichiers appartenant à l'utilisateur.
drop policy if exists "posts_media_own_delete" on storage.objects;
create policy "posts_media_own_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'posts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Vérification rapide:
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'posts';
