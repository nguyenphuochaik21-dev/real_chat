-- Restrict WebRTC signaling broadcasts to the two participants of each call session.

CREATE OR REPLACE FUNCTION public.can_access_call_signaling_topic(p_topic TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH request_context AS (
    SELECT
      CASE
        WHEN p_topic ~ '^call-signaling-[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          THEN RIGHT(p_topic, 36)::UUID
        ELSE NULL
      END AS session_id,
      (SELECT auth.uid()) AS user_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM request_context
    JOIN public.call_sessions AS session ON session.id = request_context.session_id
    WHERE request_context.user_id IS NOT NULL
      AND request_context.user_id IN (session.caller_id, session.callee_id)
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_call_signaling_topic(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_call_signaling_topic(TEXT) TO authenticated;

DROP POLICY IF EXISTS call_signaling_broadcast_select ON realtime.messages;
CREATE POLICY call_signaling_broadcast_select
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND public.can_access_call_signaling_topic((SELECT realtime.topic()))
  );

DROP POLICY IF EXISTS call_signaling_broadcast_insert ON realtime.messages;
CREATE POLICY call_signaling_broadcast_insert
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    realtime.messages.extension = 'broadcast'
    AND public.can_access_call_signaling_topic((SELECT realtime.topic()))
  );
