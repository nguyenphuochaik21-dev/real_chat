ALTER TABLE public.chat_assistant_requests DROP CONSTRAINT IF EXISTS chat_assistant_requests_status_check;
ALTER TABLE public.chat_assistant_requests ADD CONSTRAINT chat_assistant_requests_status_check
  CHECK (status IN ('processing', 'completed', 'failed', 'cancelled'));
ALTER TABLE public.ai_turns DROP CONSTRAINT IF EXISTS ai_turns_status_check;
ALTER TABLE public.ai_turns ADD CONSTRAINT ai_turns_status_check
  CHECK (status IN ('processing', 'completed', 'failed', 'uncertain', 'cancelled'));

CREATE OR REPLACE FUNCTION public.begin_default_ai_assistant_request(
  p_user_id UUID, p_conversation_id UUID, p_id UUID, p_content TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql SET search_path = public AS $$
DECLARE previous public.chat_assistant_requests;
BEGIN
  PERFORM 1 FROM public.profiles WHERE id = p_user_id AND NOT is_suspended FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  PERFORM 1 FROM public.conversations c
    JOIN public.conversation_participants p ON p.conversation_id = c.id
    WHERE c.id = p_conversation_id AND c.type = 'ai'
      AND c.created_by = p_user_id AND p.user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO previous FROM public.chat_assistant_requests WHERE id = p_id;
  IF FOUND THEN
    IF previous.user_id <> p_user_id OR previous.conversation_id <> p_conversation_id
      OR previous.content <> p_content THEN RAISE EXCEPTION 'REQUEST_CONFLICT'; END IF;
    RETURN false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.conversations c
    JOIN public.ai_agents a ON a.id = c.ai_agent_id
    JOIN public.ai_connections x ON x.agent_id = a.id
    WHERE c.id = p_conversation_id AND a.enabled AND a.available_to_users
      AND a.archived_at IS NULL) THEN
    RAISE EXCEPTION 'AI_DISABLED';
  END IF;
  UPDATE public.chat_assistant_requests SET status = 'failed', error_code = 'N8N_TIMEOUT'
    WHERE user_id = p_user_id AND status = 'processing'
      AND created_at < now() - interval '3 minutes';
  IF EXISTS (SELECT 1 FROM public.chat_assistant_requests
    WHERE conversation_id = p_conversation_id AND status = 'processing') THEN
    RAISE EXCEPTION 'AI_BUSY';
  END IF;
  IF (SELECT count(*) FROM public.chat_assistant_requests WHERE user_id = p_user_id
    AND created_at > now() - interval '1 minute') >= 10 THEN
    RAISE EXCEPTION 'RATE_LIMITED';
  END IF;
  IF length(btrim(p_content)) NOT BETWEEN 1 AND 8000 THEN RAISE EXCEPTION 'INVALID_MESSAGE'; END IF;
  INSERT INTO public.chat_assistant_requests(id, conversation_id, user_id, content)
    VALUES (p_id, p_conversation_id, p_user_id, p_content);
  INSERT INTO public.messages(id, conversation_id, sender_id, content, content_type, metadata)
    VALUES (p_id, p_conversation_id, p_user_id, p_content, 'text',
      jsonb_build_object('ai_request_id', p_id, 'ai_status', 'processing'));
  UPDATE public.conversations SET last_message_at = now() WHERE id = p_conversation_id;
  RETURN true;
END $$;

-- Completion and user-message status change share the request lock with cancellation.
CREATE OR REPLACE FUNCTION public.finish_chat_assistant_request(
  p_id UUID, p_text TEXT, p_metadata JSONB
) RETURNS VOID LANGUAGE plpgsql SET search_path = public AS $$
DECLARE request public.chat_assistant_requests;
BEGIN
  SELECT * INTO request FROM public.chat_assistant_requests WHERE id = p_id FOR UPDATE;
  IF request.id IS NULL OR request.status <> 'processing' THEN RETURN; END IF;
  IF length(btrim(p_text)) NOT BETWEEN 1 AND 32000 THEN RAISE EXCEPTION 'INVALID_MESSAGE'; END IF;
  INSERT INTO public.messages(conversation_id, sender_id, content, content_type, metadata)
    VALUES (request.conversation_id, NULL, p_text, 'text',
      p_metadata || jsonb_build_object('sender_type', 'ai', 'ai_request_id', p_id));
  UPDATE public.chat_assistant_requests SET status = 'completed', error_code = NULL WHERE id = p_id;
  UPDATE public.messages SET metadata = (metadata - 'ai_error_code')
    || jsonb_build_object('ai_request_id', p_id, 'ai_status', 'completed') WHERE id = p_id;
  UPDATE public.conversations SET last_message_at = now() WHERE id = request.conversation_id;
END $$;

CREATE OR REPLACE FUNCTION public.fail_chat_assistant_request(p_id UUID, p_error TEXT)
RETURNS TEXT LANGUAGE plpgsql SET search_path = public AS $$
DECLARE request public.chat_assistant_requests;
BEGIN
  SELECT * INTO request FROM public.chat_assistant_requests WHERE id = p_id FOR UPDATE;
  IF request.id IS NULL THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  IF request.status = 'processing' THEN
    UPDATE public.chat_assistant_requests SET status = 'failed', error_code = p_error WHERE id = p_id;
    UPDATE public.messages SET metadata = metadata
      || jsonb_build_object('ai_request_id', p_id, 'ai_status', 'failed', 'ai_error_code', p_error)
      WHERE id = p_id;
    RETURN 'failed';
  END IF;
  RETURN request.status;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_ai_generation(
  p_user_id UUID, p_conversation_id UUID, p_id UUID, p_content TEXT, p_channel TEXT
) RETURNS JSONB LANGUAGE plpgsql SET search_path = public AS $$
DECLARE request public.chat_assistant_requests; turn public.ai_turns;
BEGIN
  -- The same lock used by both claim functions also covers Stop arriving before Send.
  PERFORM 1 FROM public.profiles WHERE id = p_user_id AND NOT is_suspended FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p_channel = 'assistant' THEN
    PERFORM 1 FROM public.conversations c
      JOIN public.conversation_participants p ON p.conversation_id = c.id
      WHERE c.id = p_conversation_id AND c.type = 'ai'
        AND c.created_by = p_user_id AND p.user_id = p_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    SELECT * INTO request FROM public.chat_assistant_requests WHERE id = p_id FOR UPDATE;
    IF request.id IS NULL THEN
      PERFORM public.begin_default_ai_assistant_request(p_user_id, p_conversation_id, p_id, p_content);
      SELECT * INTO request FROM public.chat_assistant_requests WHERE id = p_id FOR UPDATE;
    END IF;
    IF request.user_id <> p_user_id OR request.conversation_id <> p_conversation_id
      OR request.content <> p_content THEN RAISE EXCEPTION 'REQUEST_CONFLICT'; END IF;
    IF request.status = 'processing' THEN
      UPDATE public.chat_assistant_requests SET status = 'cancelled', error_code = NULL WHERE id = p_id;
      UPDATE public.messages SET metadata = (metadata - 'ai_error_code')
        || jsonb_build_object('ai_request_id', p_id, 'ai_status', 'cancelled') WHERE id = p_id;
      RETURN jsonb_build_object('status', 'cancelled');
    END IF;
    RETURN jsonb_build_object('status', request.status);
  ELSIF p_channel = 'agent' THEN
    PERFORM 1 FROM public.ai_conversations WHERE id = p_conversation_id AND user_id = p_user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
    SELECT * INTO turn FROM public.ai_turns WHERE id = p_id FOR UPDATE;
    IF turn.id IS NULL THEN
      PERFORM public.begin_ai_turn(p_user_id, p_conversation_id, p_id, p_content);
      SELECT * INTO turn FROM public.ai_turns WHERE id = p_id FOR UPDATE;
    END IF;
    IF turn.user_id <> p_user_id OR turn.conversation_id <> p_conversation_id
      OR turn.content <> p_content THEN RAISE EXCEPTION 'REQUEST_CONFLICT'; END IF;
    IF turn.status IN ('processing', 'uncertain') THEN
      UPDATE public.ai_turns SET status = 'cancelled', reply = NULL, reply_attachments = '[]'::jsonb,
        error_message = NULL, error_code = NULL WHERE id = p_id RETURNING * INTO turn;
    END IF;
    RETURN jsonb_build_object('status', turn.status, 'turn', to_jsonb(turn));
  ELSE
    RAISE EXCEPTION 'INVALID_CHANNEL';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.fail_chat_assistant_request(UUID, TEXT),
  public.cancel_ai_generation(UUID, UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_chat_assistant_request(UUID, TEXT),
  public.cancel_ai_generation(UUID, UUID, UUID, TEXT, TEXT) TO service_role;
NOTIFY pgrst, 'reload schema';
