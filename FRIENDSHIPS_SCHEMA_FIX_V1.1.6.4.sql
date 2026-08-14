-- Tafaß V1.1.6.4
-- Schema réel de public.friendships:
-- id, requester_id, receiver_id, status, created_at, updated_at
-- Cette correction n'ajoute aucune colonne.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.friendships TO authenticated;

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "friendships_select_own" ON public.friendships;
CREATE POLICY "friendships_select_own"
ON public.friendships
FOR SELECT TO authenticated
USING (requester_id = auth.uid() OR receiver_id = auth.uid());

DROP POLICY IF EXISTS "friendships_insert_requester" ON public.friendships;
CREATE POLICY "friendships_insert_requester"
ON public.friendships
FOR INSERT TO authenticated
WITH CHECK (requester_id = auth.uid() AND requester_id <> receiver_id);

DROP POLICY IF EXISTS "friendships_update_participant" ON public.friendships;
CREATE POLICY "friendships_update_participant"
ON public.friendships
FOR UPDATE TO authenticated
USING (requester_id = auth.uid() OR receiver_id = auth.uid())
WITH CHECK (requester_id = auth.uid() OR receiver_id = auth.uid());

DROP POLICY IF EXISTS "friendships_delete_participant" ON public.friendships;
CREATE POLICY "friendships_delete_participant"
ON public.friendships
FOR DELETE TO authenticated
USING (requester_id = auth.uid() OR receiver_id = auth.uid());

CREATE INDEX IF NOT EXISTS friendships_requester_status_idx ON public.friendships(requester_id, status);
CREATE INDEX IF NOT EXISTS friendships_receiver_status_idx ON public.friendships(receiver_id, status);
