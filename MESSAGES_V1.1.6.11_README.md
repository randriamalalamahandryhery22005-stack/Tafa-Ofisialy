# Tafaß V1.1.6.11 — Messages / Chat

Base: V1.1.6.10.7

- Supabase Auth / auth.uid() remains source of truth.
- Private conversations use public.conversations + members.
- Messages use public.messages.
- Realtime refresh remains enabled.
- Opening a conversation marks received messages as read.
- Sender messages show ✓ sent / ✓✓ read.
- Conversation search filters by person, conversation name, or latest text.
- Compact attachment control; media/file picker stays hidden until requested.

No new SQL is required if the existing V18.5 conversation/message RLS + RPC setup is already installed.
