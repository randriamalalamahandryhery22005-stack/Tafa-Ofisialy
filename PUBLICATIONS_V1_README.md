# Tafaß Publications — V1

This package is focused on the Publications layer.

## Scope
- Preserve existing Auth / inscription / connexion.
- Preserve the existing Supabase architecture.
- Keep posts, reactions, comments, shares and Realtime Supabase-based.
- Do not replace the database schema wholesale.

## Recommended migration order
1. Verify the currently deployed schema against:
   - INTERACTIONS_V15_REACTION_FIX.sql
   - REALTIME_V18.3_SCHEMA-COMPAT.sql
   - V18.5_FINAL_RLS_REALTIME_FIX.sql
2. Verify RLS for posts, post_reactions and comments.
3. Verify Realtime publication membership for posts, post_reactions and comments.
4. Test reaction RPC: tafa_set_post_reaction.
5. Test share RPC: tafa_increment_post_share.
6. Test comment insert/read using comments.content.
7. Test a second logged-in client for Realtime updates.

## Important
Do NOT execute every SQL file in this repository in arbitrary order.
The repository contains several historical migrations and compatibility fixes.
The deployed database should be checked first and only the required migration(s) applied.

## Acceptance tests
- User can create a post.
- Reaction persists after refresh.
- Changing/removing a reaction updates the same user's reaction correctly.
- Comment persists after refresh.
- Share increments once per successful share action according to the app's current UX.
- Changes from another client appear through Realtime without breaking Auth.
