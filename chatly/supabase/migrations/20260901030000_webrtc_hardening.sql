-- Tighten call authorization and make call history writes idempotent.

ALTER TABLE public.call_history
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.call_sessions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS call_history_session_id_unique
  ON public.call_history(session_id)
  WHERE session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.initiate_call(
  p_callee_id UUID,
  p_conversation_id UUID,
  p_call_type call_type DEFAULT 'voice'
)
RETURNS call_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session call_sessions;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_callee_id = auth.uid() THEN RAISE EXCEPTION 'Cannot call yourself'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = auth.uid()
  ) OR NOT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = p_callee_id
  ) THEN
    RAISE EXCEPTION 'Both users must participate in the conversation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = auth.uid() AND blocked_id = p_callee_id)
       OR (blocker_id = p_callee_id AND blocked_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Calling is not available for this user';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_callee_id AND is_suspended) THEN
    RAISE EXCEPTION 'The recipient account is unavailable';
  END IF;

  INSERT INTO public.call_sessions (
    caller_id, callee_id, conversation_id, call_type, status
  ) VALUES (
    auth.uid(), p_callee_id, p_conversation_id, p_call_type, 'pending'
  )
  RETURNING * INTO v_session;

  RETURN v_session;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_call_status(
  p_session_id UUID,
  p_status call_session_status,
  p_answer_sdp TEXT DEFAULT NULL
)
RETURNS call_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session call_sessions;
BEGIN
  SELECT * INTO v_session FROM public.call_sessions WHERE id = p_session_id FOR UPDATE;

  IF v_session.id IS NULL OR auth.uid() NOT IN (v_session.caller_id, v_session.callee_id) THEN
    RAISE EXCEPTION 'Not a participant of this call';
  END IF;

  IF p_status IN ('answered', 'declined') AND auth.uid() <> v_session.callee_id THEN
    RAISE EXCEPTION 'Only the recipient can answer or decline this call';
  END IF;

  UPDATE public.call_sessions
  SET status = p_status,
      answer_sdp = COALESCE(p_answer_sdp, answer_sdp),
      answered_at = CASE WHEN p_status = 'answered' THEN COALESCE(answered_at, NOW())
                         ELSE answered_at END,
      ended_at = CASE WHEN p_status IN ('declined', 'missed', 'ended', 'failed') THEN NOW()
                      ELSE ended_at END
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  RETURN v_session;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_call(
  p_session_id UUID,
  p_status call_session_status DEFAULT 'ended'
)
RETURNS call_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session call_sessions;
  v_duration INTEGER;
BEGIN
  SELECT * INTO v_session FROM public.call_sessions WHERE id = p_session_id FOR UPDATE;

  IF v_session.id IS NULL OR auth.uid() NOT IN (v_session.caller_id, v_session.callee_id) THEN
    RAISE EXCEPTION 'Not a participant of this call';
  END IF;

  IF v_session.ended_at IS NOT NULL THEN RETURN v_session; END IF;

  v_duration := CASE
    WHEN v_session.answered_at IS NULL THEN 0
    ELSE EXTRACT(EPOCH FROM (NOW() - v_session.answered_at))::INTEGER
  END;

  UPDATE public.call_sessions SET status = p_status, ended_at = NOW()
  WHERE id = p_session_id RETURNING * INTO v_session;

  INSERT INTO public.call_history (
    session_id, caller_id, callee_id, conversation_id, call_type, direction,
    status, duration_seconds, started_at, ended_at
  ) VALUES (
    v_session.id, v_session.caller_id, v_session.callee_id, v_session.conversation_id,
    v_session.call_type,
    CASE WHEN v_session.caller_id = auth.uid() THEN 'outgoing' ELSE 'incoming' END,
    p_status, v_duration, v_session.started_at, v_session.ended_at
  )
  ON CONFLICT (session_id) WHERE session_id IS NOT NULL DO NOTHING;

  RETURN v_session;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_call_history(
  p_user_id UUID DEFAULT auth.uid(),
  p_limit INTEGER DEFAULT 50
)
RETURNS SETOF call_history
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id <> auth.uid() AND NOT public.is_chatly_admin() THEN
    RAISE EXCEPTION 'Not authorized to view this call history';
  END IF;

  RETURN QUERY
  SELECT * FROM public.call_history
  WHERE caller_id = p_user_id OR callee_id = p_user_id
  ORDER BY started_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 200);
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_end_missed_calls()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.call_sessions%ROWTYPE;
BEGIN
  FOR v_session IN
    SELECT *
    FROM public.call_sessions
    WHERE status IN ('pending', 'ringing')
      AND started_at < NOW() - INTERVAL '60 seconds'
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.call_sessions
    SET status = 'missed', ended_at = NOW()
    WHERE id = v_session.id;

    INSERT INTO public.call_history (
      session_id, caller_id, callee_id, conversation_id, call_type, direction,
      status, duration_seconds, started_at, ended_at
    ) VALUES (
      v_session.id, v_session.caller_id, v_session.callee_id, v_session.conversation_id,
      v_session.call_type, 'outgoing', 'missed', 0, v_session.started_at, NOW()
    )
    ON CONFLICT (session_id) WHERE session_id IS NOT NULL DO NOTHING;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.initiate_call(UUID, UUID, call_type) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_call_status(UUID, call_session_status, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.end_call(UUID, call_session_status) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_call_history(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_end_missed_calls() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.initiate_call(UUID, UUID, call_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_call_status(UUID, call_session_status, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_call(UUID, call_session_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_call_history(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_end_missed_calls() TO service_role;
