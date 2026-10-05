-- Keep the legacy assistant tables and functions for deployed clients during migration.
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS available_to_users BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS ai_agents_one_default ON public.ai_agents(is_default)
  WHERE is_default;

ALTER TABLE public.ai_agents DROP CONSTRAINT IF EXISTS ai_agents_default_active;
ALTER TABLE public.ai_agents ADD CONSTRAINT ai_agents_default_active
  CHECK (NOT is_default OR (enabled AND available_to_users AND archived_at IS NULL));

ALTER TABLE public.ai_connections
  ADD COLUMN IF NOT EXISTS auth_type TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS auth_header_name TEXT NOT NULL DEFAULT 'X-N8N-SECRET',
  ADD COLUMN IF NOT EXISTS protocol TEXT NOT NULL DEFAULT 'chat',
  ADD COLUMN IF NOT EXISTS timeout_ms INTEGER NOT NULL DEFAULT 55000,
  ADD COLUMN IF NOT EXISTS last_tested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_status TEXT NOT NULL DEFAULT 'not_tested',
  ADD COLUMN IF NOT EXISTS last_latency_ms INTEGER,
  ADD COLUMN IF NOT EXISTS last_error_code TEXT;

ALTER TABLE public.ai_connections DROP CONSTRAINT IF EXISTS ai_connections_auth_type_check;
ALTER TABLE public.ai_connections ADD CONSTRAINT ai_connections_auth_type_check
  CHECK (auth_type IN ('none', 'basic', 'header_secret'));
ALTER TABLE public.ai_connections DROP CONSTRAINT IF EXISTS ai_connections_protocol_check;
ALTER TABLE public.ai_connections ADD CONSTRAINT ai_connections_protocol_check
  CHECK (protocol IN ('chat', 'legacy'));
ALTER TABLE public.ai_connections DROP CONSTRAINT IF EXISTS ai_connections_timeout_check;
ALTER TABLE public.ai_connections ADD CONSTRAINT ai_connections_timeout_check
  CHECK (timeout_ms BETWEEN 1000 AND 120000);

UPDATE public.ai_connections SET auth_type = 'basic'
  WHERE credentials IS NOT NULL AND auth_type = 'none';

DROP POLICY IF EXISTS ai_agents_read ON public.ai_agents;
CREATE POLICY ai_agents_read ON public.ai_agents FOR SELECT TO authenticated
  USING (
    (enabled AND available_to_users AND archived_at IS NULL)
    OR public.is_chatly_admin((SELECT auth.uid()))
  );

INSERT INTO public.ai_agents(name, description, welcome_message, avatar_url,
  enabled, available_to_users, is_default)
SELECT name, description, welcome_message, avatar_url, enabled, true, true
FROM public.chat_assistant_config
WHERE id AND enabled AND connection_encrypted IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.ai_agents WHERE is_default);

CREATE OR REPLACE FUNCTION public.save_ai_agent_v2(
  p_id UUID, p_name TEXT, p_description TEXT, p_welcome TEXT, p_avatar TEXT,
  p_enabled BOOLEAN, p_available BOOLEAN, p_default BOOLEAN, p_archived BOOLEAN,
  p_url TEXT, p_auth_type TEXT, p_auth_header TEXT, p_protocol TEXT,
  p_timeout_ms INTEGER, p_credentials TEXT, p_replace_credentials BOOLEAN
) RETURNS VOID LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE was_default BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('chatly-default-ai-agent'));
  SELECT is_default INTO was_default FROM public.ai_agents WHERE id = p_id;
  IF COALESCE(was_default, false) AND NOT p_default THEN
    RAISE EXCEPTION 'DEFAULT_AGENT_REQUIRED';
  END IF;
  IF p_default AND (NOT p_enabled OR NOT p_available OR p_archived) THEN
    RAISE EXCEPTION 'DEFAULT_AGENT_MUST_BE_ACTIVE';
  END IF;
  IF p_default THEN UPDATE public.ai_agents SET is_default = false WHERE is_default; END IF;
  INSERT INTO public.ai_agents(id, name, description, welcome_message, avatar_url,
    enabled, available_to_users, is_default, archived_at)
  VALUES (p_id, p_name, p_description, p_welcome, p_avatar,
    p_enabled, p_available, p_default, CASE WHEN p_archived THEN now() ELSE NULL END)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name,
    description = EXCLUDED.description, welcome_message = EXCLUDED.welcome_message,
    avatar_url = EXCLUDED.avatar_url, enabled = EXCLUDED.enabled,
    available_to_users = EXCLUDED.available_to_users, is_default = EXCLUDED.is_default,
    archived_at = CASE WHEN p_archived THEN COALESCE(public.ai_agents.archived_at, now()) ELSE NULL END;
  INSERT INTO public.ai_connections(agent_id, chat_url, credentials, auth_type,
    auth_header_name, protocol, timeout_ms, last_status, last_tested_at, last_error_code)
  VALUES (p_id, p_url, p_credentials, p_auth_type, p_auth_header, p_protocol,
    p_timeout_ms, 'not_tested', NULL, NULL)
  ON CONFLICT (agent_id) DO UPDATE SET chat_url = EXCLUDED.chat_url,
    credentials = CASE WHEN p_replace_credentials THEN EXCLUDED.credentials
      ELSE public.ai_connections.credentials END,
    auth_type = EXCLUDED.auth_type, auth_header_name = EXCLUDED.auth_header_name,
    protocol = EXCLUDED.protocol, timeout_ms = EXCLUDED.timeout_ms,
    last_status = CASE WHEN public.ai_connections.chat_url IS DISTINCT FROM EXCLUDED.chat_url
      OR public.ai_connections.auth_type IS DISTINCT FROM EXCLUDED.auth_type
      OR public.ai_connections.protocol IS DISTINCT FROM EXCLUDED.protocol
      OR p_replace_credentials THEN 'not_tested' ELSE public.ai_connections.last_status END,
    last_tested_at = CASE WHEN public.ai_connections.chat_url IS DISTINCT FROM EXCLUDED.chat_url
      OR public.ai_connections.auth_type IS DISTINCT FROM EXCLUDED.auth_type
      OR public.ai_connections.protocol IS DISTINCT FROM EXCLUDED.protocol
      OR p_replace_credentials THEN NULL ELSE public.ai_connections.last_tested_at END,
    last_error_code = CASE WHEN public.ai_connections.chat_url IS DISTINCT FROM EXCLUDED.chat_url
      OR public.ai_connections.auth_type IS DISTINCT FROM EXCLUDED.auth_type
      OR public.ai_connections.protocol IS DISTINCT FROM EXCLUDED.protocol
      OR p_replace_credentials THEN NULL ELSE public.ai_connections.last_error_code END;
  IF p_default THEN
    UPDATE public.conversations SET title = p_name, avatar_url = NULLIF(p_avatar, '')
      WHERE type = 'ai';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.save_ai_agent_v2(UUID, TEXT, TEXT, TEXT, TEXT,
  BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_ai_agent_v2(UUID, TEXT, TEXT, TEXT, TEXT,
  BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN)
  TO service_role;

CREATE OR REPLACE FUNCTION public.open_default_ai_assistant(p_user_id UUID) RETURNS UUID
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE target UUID; agent public.ai_agents;
BEGIN
  PERFORM 1 FROM public.profiles WHERE id = p_user_id AND NOT is_suspended FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO agent FROM public.ai_agents WHERE is_default AND enabled
    AND available_to_users AND archived_at IS NULL;
  IF agent.id IS NULL OR NOT EXISTS
    (SELECT 1 FROM public.ai_connections WHERE agent_id = agent.id) THEN
    RAISE EXCEPTION 'AI_DISABLED';
  END IF;
  SELECT id INTO target FROM public.conversations WHERE type = 'ai' AND created_by = p_user_id;
  IF target IS NOT NULL THEN
    UPDATE public.conversation_participants SET hidden_at = NULL
      WHERE conversation_id = target AND user_id = p_user_id;
    RETURN target;
  END IF;
  INSERT INTO public.conversations(type, created_by, title, avatar_url)
    VALUES ('ai', p_user_id, agent.name, NULLIF(agent.avatar_url, '')) RETURNING id INTO target;
  INSERT INTO public.conversation_participants(conversation_id, user_id)
    VALUES (target, p_user_id);
  IF length(agent.welcome_message) > 0 THEN
    INSERT INTO public.messages(conversation_id, sender_id, content, content_type, metadata)
      VALUES (target, NULL, agent.welcome_message, 'text', '{"sender_type":"ai"}');
  END IF;
  RETURN target;
END $$;
REVOKE ALL ON FUNCTION public.open_default_ai_assistant(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_default_ai_assistant(UUID) TO service_role;

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
  IF NOT EXISTS (SELECT 1 FROM public.ai_agents a
    JOIN public.ai_connections c ON c.agent_id = a.id
    WHERE a.is_default AND a.enabled AND a.available_to_users AND a.archived_at IS NULL) THEN
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
  INSERT INTO public.messages(id, conversation_id, sender_id, content, content_type)
    VALUES (p_id, p_conversation_id, p_user_id, p_content, 'text');
  UPDATE public.conversations SET last_message_at = now() WHERE id = p_conversation_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.begin_default_ai_assistant_request(UUID, UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_default_ai_assistant_request(UUID, UUID, UUID, TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.begin_ai_turn(
  p_user_id UUID, p_conversation_id UUID, p_id UUID, p_content TEXT
) RETURNS JSONB LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE existing public.ai_turns;
BEGIN
  PERFORM 1 FROM public.profiles WHERE id = p_user_id AND NOT is_suspended FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AI_ACCOUNT'; END IF;
  PERFORM 1 FROM public.ai_conversations c JOIN public.ai_agents a ON a.id = c.agent_id
    WHERE c.id = p_conversation_id AND c.user_id = p_user_id AND a.enabled
      AND a.available_to_users AND a.archived_at IS NULL;
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
    AND created_at > now() - interval '1 minute') >= 10 THEN RAISE EXCEPTION 'AI_RATE'; END IF;
  INSERT INTO public.ai_turns(id, conversation_id, user_id, content)
    VALUES (p_id, p_conversation_id, p_user_id, p_content) RETURNING * INTO existing;
  UPDATE public.ai_conversations SET title = left(p_content, 80)
    WHERE id = p_conversation_id AND title = 'Cuộc trò chuyện mới';
  RETURN jsonb_build_object('turn', to_jsonb(existing), 'claimed', true);
END;
$$;
REVOKE ALL ON FUNCTION public.begin_ai_turn(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_ai_turn(UUID, UUID, UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
