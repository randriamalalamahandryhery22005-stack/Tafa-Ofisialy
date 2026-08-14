# Tafaß V1.1.6.11.1 — Messages Supabase Sync Fix

- Messages source of truth uses `conversation_members` first, then `conversations.members[]` fallback.
- Conversations are loaded for the authenticated user from Supabase.
- Messages are reloaded after send.
- Message text supports both `text` and `content` columns.
- Starting a conversation awaits the Supabase RPC before opening it.
- No SQL/table changes are required by this frontend fix.
