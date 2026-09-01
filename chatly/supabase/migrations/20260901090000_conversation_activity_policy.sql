-- Participants may update activity timestamps, while column grants protect conversation metadata.

DROP POLICY IF EXISTS conversations_update ON public.conversations;
CREATE POLICY conversations_update
  ON public.conversations FOR UPDATE
  TO authenticated
  USING (public.is_conversation_participant(id))
  WITH CHECK (public.is_conversation_participant(id));
