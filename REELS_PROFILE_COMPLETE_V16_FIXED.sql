-- TAFAß V16.1 — REELS + PROFIL COMPLET
-- Supabase migration only.
-- IMPORTANT: execute this file in Supabase SQL Editor.
-- This migration does not modify Auth, Realtime, Storage, RLS, or application logic.

-- Convert existing video publications to Reels.
UPDATE public.posts
SET media_type = 'reel'
WHERE media_type = 'video';

-- Verification (optional):
-- SELECT media_type, COUNT(*)
-- FROM public.posts
-- GROUP BY media_type
-- ORDER BY media_type;
