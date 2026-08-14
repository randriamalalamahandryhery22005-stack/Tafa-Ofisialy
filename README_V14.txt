TAFA V14 — FINAL INTERACTIONS DISPLAY FIX

The V13 backend functions are already sufficient. This version fixes the frontend synchronization problem where reactions, comments and shares were successfully saved but were not visible immediately afterward.

Important:
1. Keep the existing Supabase database and V13 SQL already executed successfully.
2. Deploy the files in this ZIP.
3. Clear browser cache/site data only if an old JS bundle is still being served.
4. Test reaction, comment, share, then refresh the page.

Live database columns used:
- post_reactions.reaction_type
- comments.content
- posts.shares

RPCs used:
- tafa_set_post_reaction
- tafa_add_comment
- tafa_increment_post_share
