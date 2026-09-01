-- Permanently delete a conversation and all conversation-scoped data.

CREATE OR REPLACE FUNCTION public.delete_conversation_permanently(
  p_conversation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation public.conversations%ROWTYPE;
BEGIN
  SELECT *
  INTO v_conversation
  FROM public.conversations
  WHERE id = p_conversation_id
  FOR UPDATE;

  IF v_conversation.id IS NULL THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  IF NOT public.is_conversation_participant(p_conversation_id) THEN
    RAISE EXCEPTION 'Not authorized to delete this conversation';
  END IF;

  IF v_conversation.type = 'group' AND v_conversation.created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Only the group creator can permanently delete this conversation';
  END IF;

  -- call_history uses ON DELETE SET NULL, so remove its conversation records explicitly.
  DELETE FROM public.call_history WHERE conversation_id = p_conversation_id;
  DELETE FROM public.conversations WHERE id = p_conversation_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_conversation_permanently(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_conversation_permanently(UUID) TO authenticated;
