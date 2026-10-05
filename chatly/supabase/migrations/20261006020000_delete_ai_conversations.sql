CREATE OR REPLACE FUNCTION public.delete_ai_conversation(
  p_user_id UUID,
  p_conversation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM 1 FROM public.profiles
  WHERE id = p_user_id AND NOT is_suspended
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI_ACCOUNT';
  END IF;

  PERFORM 1 FROM public.ai_conversations
  WHERE id = p_conversation_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AI_CONVERSATION';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ai_turns
    WHERE conversation_id = p_conversation_id
      AND status IN ('processing', 'uncertain')
  ) THEN
    RAISE EXCEPTION 'AI_CONVERSATION_ACTIVE';
  END IF;

  DELETE FROM public.ai_conversations
  WHERE id = p_conversation_id AND user_id = p_user_id;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_ai_conversation(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_ai_conversation(UUID, UUID) TO service_role;
