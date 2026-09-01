-- PostgreSQL resolves CASE expressions to text unless their enum type is explicit.
-- Keep call completion atomic while writing the matching history row.

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
    CASE
      WHEN v_session.caller_id = auth.uid() THEN 'outgoing'::public.call_direction
      ELSE 'incoming'::public.call_direction
    END,
    p_status, v_duration, v_session.started_at, v_session.ended_at
  )
  ON CONFLICT (session_id) WHERE session_id IS NOT NULL DO NOTHING;

  RETURN v_session;
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
      v_session.call_type, 'outgoing'::public.call_direction,
      'missed', 0, v_session.started_at, NOW()
    )
    ON CONFLICT (session_id) WHERE session_id IS NOT NULL DO NOTHING;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.end_call(UUID, call_session_status) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_end_missed_calls() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_call(UUID, call_session_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_end_missed_calls() TO service_role;
