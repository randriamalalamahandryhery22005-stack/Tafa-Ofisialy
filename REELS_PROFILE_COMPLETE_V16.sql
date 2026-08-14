-- TAFAß V16 — Reels + Profil complet
-- Safe migration: keeps Supabase/Auth/Realtime architecture intact.
-- All existing video posts become Reels.
update public.posts
set media_type = 'reel'
where media_type = 'video';

-- Optional consistency check:
-- select media_type, count(*) from public.posts group by media_type order by media_type;
