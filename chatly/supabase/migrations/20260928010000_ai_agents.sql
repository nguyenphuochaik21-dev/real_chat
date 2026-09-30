-- AI configuration is managed through the authenticated Chatly server.
CREATE TABLE public.ai_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  welcome_message TEXT NOT NULL DEFAULT '' CHECK (length(welcome_message) <= 2000),
  avatar_url TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.ai_connections (
  agent_id UUID PRIMARY KEY REFERENCES public.ai_agents ON DELETE CASCADE,
  chat_url TEXT NOT NULL,
  credentials TEXT
);
CREATE TABLE public.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.ai_agents,
  user_id UUID NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Cuộc trò chuyện mới',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE public.ai_turns (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.ai_conversations ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 8000),
  reply TEXT CHECK (length(reply) <= 32000),
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'failed', 'uncertain')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_conversations_owner ON public.ai_conversations(user_id, created_at DESC);
CREATE INDEX ai_turns_history ON public.ai_turns(conversation_id, created_at DESC, id);
CREATE INDEX ai_turns_rate ON public.ai_turns(user_id, created_at DESC);
CREATE UNIQUE INDEX ai_turns_one_processing ON public.ai_turns(conversation_id)
  WHERE status = 'processing';

ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_turns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_agents, public.ai_connections, public.ai_conversations, public.ai_turns
  FROM anon, authenticated;
GRANT SELECT ON public.ai_agents, public.ai_conversations, public.ai_turns TO authenticated;
GRANT ALL ON public.ai_agents, public.ai_connections, public.ai_conversations, public.ai_turns
  TO service_role;
CREATE POLICY ai_agents_read ON public.ai_agents FOR SELECT TO authenticated
  USING (enabled OR public.is_chatly_admin((SELECT auth.uid())));
CREATE POLICY ai_conversations_read ON public.ai_conversations FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY ai_turns_read ON public.ai_turns FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE FUNCTION public.save_ai_agent(
  p_id UUID, p_name TEXT, p_description TEXT, p_welcome TEXT, p_avatar TEXT,
  p_enabled BOOLEAN, p_url TEXT, p_credentials TEXT, p_replace_credentials BOOLEAN
) RETURNS VOID LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  INSERT INTO public.ai_agents(id, name, description, welcome_message, avatar_url, enabled)
  VALUES (p_id, p_name, p_description, p_welcome, p_avatar, p_enabled)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
    welcome_message = EXCLUDED.welcome_message, avatar_url = EXCLUDED.avatar_url,
    enabled = EXCLUDED.enabled;
  INSERT INTO public.ai_connections(agent_id, chat_url, credentials)
  VALUES (p_id, p_url, p_credentials)
  ON CONFLICT (agent_id) DO UPDATE SET chat_url = EXCLUDED.chat_url,
    credentials = CASE WHEN p_replace_credentials THEN EXCLUDED.credentials
      ELSE public.ai_connections.credentials END;
END;
$$;

CREATE FUNCTION public.begin_ai_turn(
  p_user_id UUID, p_conversation_id UUID, p_id UUID, p_content TEXT
) RETURNS JSONB LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  existing public.ai_turns;
BEGIN
  -- One per-user lock makes both rate limiting and per-conversation claiming atomic.
  PERFORM 1 FROM public.profiles WHERE id = p_user_id AND NOT is_suspended FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AI_ACCOUNT'; END IF;
  PERFORM 1 FROM public.ai_conversations c JOIN public.ai_agents a ON a.id = c.agent_id
    WHERE c.id = p_conversation_id AND c.user_id = p_user_id AND a.enabled;
  IF NOT FOUND THEN RAISE EXCEPTION 'AI_ACCESS'; END IF;
  SELECT * INTO existing FROM public.ai_turns WHERE id = p_id;
  IF FOUND THEN
    IF existing.user_id <> p_user_id OR existing.conversation_id <> p_conversation_id
      OR existing.content <> p_content THEN RAISE EXCEPTION 'AI_CONFLICT'; END IF;
    RETURN jsonb_build_object('turn', to_jsonb(existing), 'claimed', false);
  END IF;
  UPDATE public.ai_turns SET status = 'uncertain',
    error_message = 'Phiên xử lý bị gián đoạn. Hãy tạo cuộc trò chuyện mới.'
    WHERE conversation_id = p_conversation_id AND status = 'processing'
      AND created_at < now() - interval '90 seconds';
  IF EXISTS (SELECT 1 FROM public.ai_turns WHERE conversation_id = p_conversation_id
    AND status IN ('processing', 'uncertain')) THEN RAISE EXCEPTION 'AI_BUSY'; END IF;
  IF (SELECT count(*) FROM public.ai_turns WHERE user_id = p_user_id
    AND created_at > now() - interval '1 minute') >= 10 THEN
    RAISE EXCEPTION 'AI_RATE';
  END IF;
  INSERT INTO public.ai_turns(id, conversation_id, user_id, content)
    VALUES (p_id, p_conversation_id, p_user_id, p_content) RETURNING * INTO existing;
  UPDATE public.ai_conversations SET title = left(p_content, 80)
    WHERE id = p_conversation_id AND title = 'Cuộc trò chuyện mới';
  RETURN jsonb_build_object('turn', to_jsonb(existing), 'claimed', true);
END;
$$;
REVOKE ALL ON FUNCTION public.begin_ai_turn(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_ai_turn(UUID, UUID, UUID, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.save_ai_agent(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_ai_agent(UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, TEXT, BOOLEAN)
  TO service_role;
