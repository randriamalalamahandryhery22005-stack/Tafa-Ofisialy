-- Tafaß V17: safe Reel migration
-- No Auth, Realtime, Storage or RLS logic is changed.
UPDATE public.posts
SET media_type = 'reel'
WHERE media_type = 'video';
