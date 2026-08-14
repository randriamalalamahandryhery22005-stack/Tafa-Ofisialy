TAFAß V18.3 — REALTIME + SCHEMA COMPATIBILITY FIX

Important:
- Interface unchanged.
- This patch is designed for the existing Supabase database.
- It detected that public.posts uses user_id while the current app uses owner_id.
- The migration adds/synchronizes compatibility columns instead of deleting data.
- It also synchronizes comments text/content and normalizes reactions.

Run ONLY:
REALTIME_V18.3_SCHEMA-COMPAT.sql

Run it once in Supabase SQL Editor. Wait for Success, then deploy this project and sign out/sign in again.
