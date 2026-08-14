TAFAß V1.1.6 — COMMENTS / REACTIONS / CLICKABLE NOTIFICATIONS

Fixes:
- Comment reactions use SECURITY DEFINER RPC tafa_set_comment_like.
- Post reactions notify the publication owner.
- Comment/reply notifications are persisted server-side.
- Notification rows now have comment_id as a source pointer.
- Clicking a notification opens the publication and scrolls to the related post/comment.
- text + content remain synchronized for comments.

SUPABASE:
Run COMMENTS_V1.1.6.sql once in SQL Editor.
Do not run older V1.1.5.x comment SQL after this.

Expected success:
TAFA V1.1.6 — COMMENTS + REACTIONS + CLICKABLE NOTIFICATIONS OK


V1.1.6.1 FIXES
- Grant EXECUTE on tafa_set_comment_like(uuid,boolean) to authenticated.
- Notification delivery uses notifications.user_id as recipient and posts.user_id as publication owner.
- Comment replies notify the author of the parent comment.
- Notification cards wrap all text and expose the notification type clearly.
- Notification clicks open the exact post/comment source when post_id/comment_id exists; actor-based notifications open the actor profile.
- Marking a notification read is persisted in Supabase.
