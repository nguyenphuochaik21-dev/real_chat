CREATE TABLE public.chat_assistant_config (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  name TEXT NOT NULL DEFAULT 'Chatly AI' CHECK (length(name) BETWEEN 1 AND 80),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  avatar_url TEXT NOT NULL DEFAULT '',
  welcome_message TEXT NOT NULL DEFAULT 'Tôi có thể giúp gì cho bạn?' CHECK (length(welcome_message) <= 2000),
  enabled BOOLEAN NOT NULL DEFAULT false,
  connection_encrypted TEXT,
  timeout_ms INTEGER NOT NULL DEFAULT 120000 CHECK (timeout_ms BETWEEN 1000 AND 120000),
  last_connection_status TEXT,
  last_success_at TIMESTAMPTZ,
  last_error TEXT,
  latency_ms INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.chat_assistant_config(id) VALUES (true);
ALTER TABLE public.chat_assistant_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_assistant_config FROM anon, authenticated;
GRANT ALL ON public.chat_assistant_config TO service_role;

CREATE UNIQUE INDEX one_chat_assistant_per_user ON public.conversations(created_by) WHERE type = 'ai';
CREATE TABLE public.chat_assistant_requests (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 8000),
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX chat_assistant_request_rate ON public.chat_assistant_requests(user_id, created_at DESC);
CREATE UNIQUE INDEX one_chat_assistant_processing ON public.chat_assistant_requests(conversation_id) WHERE status = 'processing';
ALTER TABLE public.chat_assistant_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_assistant_requests FROM anon, authenticated;
GRANT ALL ON public.chat_assistant_requests TO service_role;
CREATE UNIQUE INDEX chat_assistant_reply_once ON public.messages((metadata->>'ai_request_id'))
  WHERE metadata ? 'ai_request_id';

-- These guards also cover calls made through existing SECURITY DEFINER RPCs.
CREATE FUNCTION public.guard_chat_assistant() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE target UUID;
BEGIN
  IF TG_TABLE_NAME = 'conversations' THEN
    IF TG_OP = 'UPDATE' AND OLD.type IS DISTINCT FROM NEW.type THEN
      IF OLD.type = 'ai' OR NEW.type = 'ai' THEN
        RAISE EXCEPTION 'Immutable conversation type' USING ERRCODE = '42501';
      END IF;
    END IF;
    IF NEW.type = 'ai' AND COALESCE(auth.role(), '') <> 'service_role' THEN
      RAISE EXCEPTION 'AI conversations are server managed' USING ERRCODE = '42501';
    END IF;
  ELSE
    target := NEW.conversation_id;
    IF EXISTS (SELECT 1 FROM public.conversations WHERE id = target AND type = 'ai') THEN
      IF TG_TABLE_NAME = 'conversation_participants' THEN
        IF NOT EXISTS (SELECT 1 FROM public.conversations WHERE id = target AND created_by = NEW.user_id) THEN
          RAISE EXCEPTION 'Private AI conversation' USING ERRCODE = '42501';
        END IF;
      ELSIF TG_TABLE_NAME = 'scheduled_messages' THEN
        RAISE EXCEPTION 'AI supports immediate text only' USING ERRCODE = '42501';
      ELSIF TG_TABLE_NAME = 'messages' AND TG_OP = 'INSERT' THEN
        IF COALESCE(auth.role(), '') <> 'service_role' OR NEW.content_type <> 'text' THEN
          RAISE EXCEPTION 'Use the AI message endpoint' USING ERRCODE = '42501';
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_chat_assistant BEFORE INSERT OR UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.guard_chat_assistant();
CREATE TRIGGER guard_chat_assistant BEFORE INSERT OR UPDATE ON public.conversation_participants
  FOR EACH ROW EXECUTE FUNCTION public.guard_chat_assistant();
CREATE TRIGGER guard_chat_assistant BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_chat_assistant();
CREATE TRIGGER guard_chat_assistant BEFORE INSERT OR UPDATE ON public.scheduled_messages
  FOR EACH ROW EXECUTE FUNCTION public.guard_chat_assistant();
REVOKE ALL ON FUNCTION public.guard_chat_assistant() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.open_chat_assistant(p_user_id UUID) RETURNS UUID
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE target UUID; config public.chat_assistant_config;
BEGIN
  PERFORM 1 FROM public.profiles WHERE id = p_user_id AND NOT is_suspended FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO config FROM public.chat_assistant_config WHERE id;
  SELECT id INTO target FROM public.conversations WHERE type = 'ai' AND created_by = p_user_id;
  IF target IS NOT NULL THEN
    UPDATE public.conversation_participants SET hidden_at = NULL WHERE conversation_id = target AND user_id = p_user_id;
    RETURN target;
  END IF;
  IF NOT config.enabled THEN RAISE EXCEPTION 'AI_DISABLED'; END IF;
  INSERT INTO public.conversations(type, created_by, title, avatar_url)
    VALUES ('ai', p_user_id, config.name, NULLIF(config.avatar_url, '')) RETURNING id INTO target;
  INSERT INTO public.conversation_participants(conversation_id, user_id) VALUES (target, p_user_id);
  IF length(config.welcome_message) > 0 THEN
    INSERT INTO public.messages(conversation_id, sender_id, content, content_type, metadata)
      VALUES (target, NULL, config.welcome_message, 'text', '{"sender_type":"ai"}');
  END IF;
  RETURN target;
END $$;

CREATE FUNCTION public.begin_chat_assistant_request(p_user_id UUID, p_conversation_id UUID, p_id UUID, p_content TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SET search_path = public AS $$
DECLARE previous public.chat_assistant_requests;
BEGIN
  PERFORM 1 FROM public.profiles WHERE id = p_user_id AND NOT is_suspended FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  PERFORM 1 FROM public.conversations c JOIN public.conversation_participants p ON p.conversation_id = c.id
    WHERE c.id = p_conversation_id AND c.type = 'ai' AND c.created_by = p_user_id AND p.user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO previous FROM public.chat_assistant_requests WHERE id = p_id;
  IF FOUND THEN
    IF previous.user_id <> p_user_id OR previous.conversation_id <> p_conversation_id OR previous.content <> p_content THEN
      RAISE EXCEPTION 'REQUEST_CONFLICT';
    END IF;
    RETURN false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.chat_assistant_config WHERE id AND enabled AND connection_encrypted IS NOT NULL) THEN
    RAISE EXCEPTION 'AI_DISABLED';
  END IF;
  UPDATE public.chat_assistant_requests SET status = 'failed', error_code = 'N8N_TIMEOUT'
    WHERE user_id = p_user_id AND status = 'processing' AND created_at < now() - interval '3 minutes';
  IF EXISTS (SELECT 1 FROM public.chat_assistant_requests WHERE conversation_id = p_conversation_id AND status = 'processing') THEN
    RAISE EXCEPTION 'AI_BUSY';
  END IF;
  IF (SELECT count(*) FROM public.chat_assistant_requests WHERE user_id = p_user_id AND created_at > now() - interval '1 minute') >= 10 THEN
    RAISE EXCEPTION 'RATE_LIMITED';
  END IF;
  IF length(btrim(p_content)) NOT BETWEEN 1 AND 8000 THEN RAISE EXCEPTION 'INVALID_MESSAGE'; END IF;
  INSERT INTO public.chat_assistant_requests(id, conversation_id, user_id, content) VALUES (p_id, p_conversation_id, p_user_id, p_content);
  INSERT INTO public.messages(id, conversation_id, sender_id, content, content_type)
    VALUES (p_id, p_conversation_id, p_user_id, p_content, 'text');
  UPDATE public.conversations SET last_message_at = now() WHERE id = p_conversation_id;
  RETURN true;
END $$;

CREATE FUNCTION public.finish_chat_assistant_request(p_id UUID, p_text TEXT, p_metadata JSONB)
RETURNS VOID LANGUAGE plpgsql SET search_path = public AS $$
DECLARE request public.chat_assistant_requests;
BEGIN
  SELECT * INTO request FROM public.chat_assistant_requests WHERE id = p_id FOR UPDATE;
  IF request.id IS NULL OR request.status <> 'processing' THEN RETURN; END IF;
  IF length(btrim(p_text)) NOT BETWEEN 1 AND 32000 THEN RAISE EXCEPTION 'INVALID_MESSAGE'; END IF;
  INSERT INTO public.messages(conversation_id, sender_id, content, content_type, metadata)
    VALUES (request.conversation_id, NULL, p_text, 'text',
      p_metadata || jsonb_build_object('sender_type', 'ai', 'ai_request_id', p_id));
  UPDATE public.chat_assistant_requests SET status = 'completed' WHERE id = p_id;
  UPDATE public.conversations SET last_message_at = now() WHERE id = request.conversation_id;
END $$;

REVOKE ALL ON FUNCTION public.open_chat_assistant(UUID),
  public.begin_chat_assistant_request(UUID, UUID, UUID, TEXT),
  public.finish_chat_assistant_request(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_chat_assistant(UUID),
  public.begin_chat_assistant_request(UUID, UUID, UUID, TEXT),
  public.finish_chat_assistant_request(UUID, TEXT, JSONB) TO service_role;
NOTIFY pgrst, 'reload schema';
