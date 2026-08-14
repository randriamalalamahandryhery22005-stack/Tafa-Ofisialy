# Publications V3 — fix based on the actual error

The screenshot confirms the live Supabase schema cache rejects `posts.text`.

The frontend now:
1. inserts the publication text into `posts.content` first;
2. falls back to `posts.text` only if the live schema explicitly says `content` is missing;
3. keeps existing Auth and other publication fields unchanged.

This avoids requiring a blind database migration just to rename/add a column.
