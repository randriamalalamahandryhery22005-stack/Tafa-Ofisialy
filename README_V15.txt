TAFA V15 — Notifications

1. Run NOTIFICATIONS_V15.sql once in Supabase SQL Editor.
2. Deploy the complete folder.
3. Notifications are persisted in public.notifications.
4. Reactions, comments, shares, replies, follows and messages can now persist notifications through the RPC.
5. Existing Auth, profiles, posts, Storage and interaction tables are not dropped or recreated.


6. REACTIONS FIX
   Run INTERACTIONS_V15_REACTION_FIX.sql once after the interaction scripts.
   It aligns post_reactions with reaction_type, permits reactions on any existing post,
   supports changing reactions, and treats NULL/empty reaction as removal.
