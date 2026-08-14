TAFAß V1.1.5.9 — EXACT SUPABASE SCHEMA FIX

Based on the verified database schema:
- comments: text + content are both NOT NULL
- comment_likes: comment_id, user_id, created_at
- notifications: user_id, actor_id, type, post_id, message, is_read, created_at
- posts owner is posts.user_id

Run COMMENTS_V1.1.5.sql once in Supabase SQL Editor.
Do not run older V1.1.5.x SQL files afterward.
