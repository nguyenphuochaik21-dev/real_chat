-- Prevent abandoned pending calls from reappearing after login or page refresh.

CREATE INDEX IF NOT EXISTS call_sessions_pending_callee_idx
  ON public.call_sessions(callee_id, started_at DESC)
  WHERE status IN ('pending', 'ringing');

CREATE OR REPLACE FUNCTION public.expire_stale_calls_for_current_user()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.call_sessions%ROWTYPE;
  v_expired_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  FOR v_session IN
    SELECT *
    FROM public.call_sessions
    WHERE (caller_id = auth.uid() OR callee_id = auth.uid())
      AND status IN ('pending', 'ringing')
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

    v_expired_count := v_expired_count + 1;
  END LOOP;

  RETURN v_expired_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_calls_for_current_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expire_stale_calls_for_current_user() TO authenticated;

-- Clear abandoned rows created before this migration.
SELECT public.auto_end_missed_calls();

-- Keep cleanup running even when neither participant has the application open.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron')
    AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'chatly-auto-end-missed-calls') THEN
    PERFORM cron.schedule(
      'chatly-auto-end-missed-calls',
      '* * * * *',
      'SELECT public.auto_end_missed_calls();'
    );
  END IF;
EXCEPTION
  WHEN undefined_table OR undefined_function OR invalid_schema_name THEN
    RAISE NOTICE 'pg_cron is unavailable; clients will expire their own stale calls';
END$$;
