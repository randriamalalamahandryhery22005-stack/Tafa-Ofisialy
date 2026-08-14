-- TAFAß V1.1.6.11.2 — Messages read/sync RPCs
-- Uses SECURITY DEFINER so RLS on conversations/messages cannot hide a valid user's data.

CREATE OR REPLACE FUNCTION public.tafa_get_user_conversations()
RETURNS TABLE (
  id uuid,
  type text,
  created_at timestamptz,
  members uuid[]
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.type, c.created_at, c.members
  FROM public.conversations c
  WHERE auth.uid() = ANY(COALESCE(c.members, '{}'::uuid[]))
     OR EXISTS (
       SELECT 1
       FROM public.conversation_members cm
       WHERE cm.conversation_id = c.id
         AND cm.user_id = auth.uid()
     )
  ORDER BY c.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.tafa_get_conversation_messages(p_conversation_ids uuid[])
RETURNS SETOF public.messages
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.*
  FROM public.messages m
  WHERE m.conversation_id = ANY(COALESCE(p_conversation_ids, '{}'::uuid[]))
    AND EXISTS (
      SELECT 1
      FROM public.conversation_members cm
      WHERE cm.conversation_id = m.conversation_id
        AND cm.user_id = auth.uid()
    )
  ORDER BY m.created_at ASC;
$$;

REVOKE ALL ON FUNCTION public.tafa_get_user_conversations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tafa_get_user_conversations() TO authenticated;

REVOKE ALL ON FUNCTION public.tafa_get_conversation_messages(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tafa_get_conversation_messages(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
