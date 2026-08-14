TAFA V11 — FIX INTERACTIONS

1. Supabase SQL Editor: run INTERACTIONS_V11.sql once.
2. Wait for: TAFA V11 interactions ready
3. Deploy this V11 folder to Vercel.
4. Test: Reaction -> Comment -> Share -> Refresh.

This version is aligned with the live database used by Tafa:
- posts uses user_id/content and has shares
- comments uses content
- reactions use post_reactions
- shares use a secure RPC that increments posts.shares

Do not rerun the old full supabase.sql.
