TAFA V12 — REACTIONS FIX

1. Run INTERACTIONS_V12.sql in Supabase SQL Editor.
2. Deploy this folder to Vercel.
3. Test: open a post -> reaction menu -> J'aime/J'adore/etc. -> refresh.

This version uses the SECURITY DEFINER RPC tafa_set_post_reaction for reaction writes,
so reaction actions no longer depend on direct client INSERT/UPDATE/DELETE permissions.
