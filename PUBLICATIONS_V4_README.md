# Tafaß Publications V4 — schema-aligned

The live Supabase database reported that `posts.text` and `posts.owner_id` were missing.
This version aligns the app with a canonical `posts` schema.

## Required one-time database step
1. Supabase → SQL Editor
2. Run `PUBLICATIONS_V4_SCHEMA_FIX.sql` once.
3. Wait a few seconds.
4. Reopen Tafaß and test a text-only publication.

The patch does not drop/recreate `posts`. It adds missing columns, migrates legacy `user_id`/`content` values when present, rebuilds Posts RLS, and reloads the PostgREST schema cache.

Do not run all historical SQL files in the repository.
