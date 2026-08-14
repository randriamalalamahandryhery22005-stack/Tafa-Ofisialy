TAFAß V1.1.5.8 — FINAL COMMENTS FIX

FIXES:
- comment_likes RLS + authenticated grants
- comments text/content compatibility
- replies with parent validation
- notifications using the real schema: notifications.recipient_id + posts.owner_id
- SECURITY DEFINER notification RPC and automatic comment/reply trigger
- Realtime for comments, comment_likes and notifications

IMPORTANT:
Run COMMENTS_V1.1.5.sql once in Supabase SQL Editor, replacing older V1.1.5.x comment SQL.
Then refresh the app.
