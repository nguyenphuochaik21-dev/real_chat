-- Phase 5: WebRTC Calls - Database Schema

-- Call session status enum
CREATE TYPE call_session_status AS ENUM (
  'pending',    -- Outgoing call waiting for answer
  'ringing',    -- Incoming call, recipient is being notified
  'answered',   -- Call was answered
  'declined',   -- Call was declined
  'missed',     -- Call was not answered
  'ended',      -- Call ended normally
  'failed'      -- Call failed (technical error)
);

-- Call type enum
CREATE TYPE call_type AS ENUM ('voice', 'video');

-- Call direction enum
CREATE TYPE call_direction AS ENUM ('incoming', 'outgoing');

-- Table: call_sessions (active/pending calls)
CREATE TABLE call_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Call metadata
  caller_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  callee_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  call_type call_type NOT NULL DEFAULT 'voice',

  -- Session state
  status call_session_status NOT NULL DEFAULT 'pending',

  -- WebRTC signaling data (stored temporarily)
  offer_sdp TEXT,
  answer_sdp TEXT,
  ice_candidates JSONB DEFAULT '[]'::JSONB,

  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure caller != callee
  CONSTRAINT different_users CHECK (caller_id != callee_id)
);

-- Indexes for call_sessions
CREATE INDEX idx_call_sessions_caller ON call_sessions(caller_id);
CREATE INDEX idx_call_sessions_callee ON call_sessions(callee_id);
CREATE INDEX idx_call_sessions_conversation ON call_sessions(conversation_id);
CREATE INDEX idx_call_sessions_status ON call_sessions(status);

-- Table: call_history (completed calls for history view)
CREATE TABLE call_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Call metadata
  caller_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  callee_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  call_type call_type NOT NULL DEFAULT 'voice',
  direction call_direction NOT NULL,

  -- Call result
  status call_session_status NOT NULL DEFAULT 'ended',

  -- Duration in seconds
  duration_seconds INTEGER DEFAULT 0,

  -- Timestamps
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for call_history
CREATE INDEX idx_call_history_caller ON call_history(caller_id, started_at DESC);
CREATE INDEX idx_call_history_callee ON call_history(callee_id, started_at DESC);
CREATE INDEX idx_call_history_conversation ON call_history(conversation_id);

-- RLS Policies for call_sessions
ALTER TABLE call_sessions ENABLE ROW LEVEL SECURITY;

-- Helper: check if user is participant of the call
CREATE OR REPLACE FUNCTION is_call_participant(session_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM call_sessions
    WHERE id = session_id
    AND (caller_id = auth.uid() OR callee_id = auth.uid())
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Helper: check if user can view call sessions for a conversation
CREATE OR REPLACE FUNCTION can_view_call_session(session_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM call_sessions cs
    JOIN conversation_participants cp ON cs.conversation_id = cp.conversation_id
    WHERE cs.id = session_id
    AND cp.user_id = auth.uid()
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Policies for call_sessions
CREATE POLICY "Participants can view call sessions for their conversations"
  ON call_sessions FOR SELECT
  TO authenticated
  USING (
    is_call_participant(id)
    OR caller_id = auth.uid()
    OR callee_id = auth.uid()
  );

CREATE POLICY "Users can create call sessions"
  ON call_sessions FOR INSERT
  TO authenticated
  WITH CHECK (caller_id = auth.uid());

CREATE POLICY "Call participants can update call sessions"
  ON call_sessions FOR UPDATE
  TO authenticated
  USING (
    caller_id = auth.uid()
    OR callee_id = auth.uid()
  );

-- RLS Policies for call_history
ALTER TABLE call_history ENABLE ROW LEVEL SECURITY;

-- Policies for call_history
CREATE POLICY "Users can view their own call history"
  ON call_history FOR SELECT
  TO authenticated
  USING (caller_id = auth.uid() OR callee_id = auth.uid());

CREATE POLICY "Users can insert their own call history"
  ON call_history FOR INSERT
  TO authenticated
  WITH CHECK (caller_id = auth.uid() OR callee_id = auth.uid());

-- Function to create call session (initiate outgoing call)
CREATE OR REPLACE FUNCTION initiate_call(
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
  v_is_participant BOOLEAN;
BEGIN
  -- Verify caller is a participant of the conversation
  SELECT EXISTS (
    SELECT 1 FROM conversation_participants
    WHERE conversation_id = p_conversation_id
    AND user_id = auth.uid()
  ) INTO v_is_participant;

  IF NOT v_is_participant THEN
    RAISE EXCEPTION 'Not a participant of this conversation';
  END IF;

  -- Create call session
  INSERT INTO call_sessions (
    caller_id,
    callee_id,
    conversation_id,
    call_type,
    status
  ) VALUES (
    auth.uid(),
    p_callee_id,
    p_conversation_id,
    p_call_type,
    'pending'
  )
  RETURNING * INTO v_session;

  RETURN v_session;
END;
$$;

-- Function to accept/decline incoming call
CREATE OR REPLACE FUNCTION update_call_status(
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
  -- Verify user is participant of this call
  IF NOT is_call_participant(p_session_id) THEN
    RAISE EXCEPTION 'Not a participant of this call';
  END IF;

  -- Update session
  UPDATE call_sessions
  SET
    status = p_status,
    answer_sdp = COALESCE(p_answer_sdp, answer_sdp),
    answered_at = CASE WHEN p_status = 'answered' THEN NOW() ELSE answered_at END,
    ended_at = CASE WHEN p_status IN ('declined', 'missed', 'ended', 'failed') THEN NOW() ELSE ended_at END
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  RETURN v_session;
END;
$$;

-- Function to update ICE candidates
CREATE OR REPLACE FUNCTION update_call_ice_candidates(
  p_session_id UUID,
  p_candidates JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify user is participant of this call
  IF NOT is_call_participant(p_session_id) THEN
    RAISE EXCEPTION 'Not a participant of this call';
  END IF;

  UPDATE call_sessions
  SET ice_candidates = p_candidates
  WHERE id = p_session_id;
END;
$$;

-- Function to end a call
CREATE OR REPLACE FUNCTION end_call(
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
  -- Get session info
  SELECT * INTO v_session FROM call_sessions WHERE id = p_session_id;

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Call session not found';
  END IF;

  -- Calculate duration if answered
  IF v_session.answered_at IS NOT NULL THEN
    v_duration := EXTRACT(EPOCH FROM (NOW() - v_session.answered_at))::INTEGER;
  ELSE
    v_duration := 0;
  END IF;

  -- Update session
  UPDATE call_sessions
  SET
    status = p_status,
    ended_at = NOW()
  WHERE id = p_session_id
  RETURNING * INTO v_session;

  -- Add to call history
  INSERT INTO call_history (
    caller_id,
    callee_id,
    conversation_id,
    call_type,
    direction,
    status,
    duration_seconds,
    started_at,
    ended_at
  ) VALUES (
    v_session.caller_id,
    v_session.callee_id,
    v_session.conversation_id,
    v_session.call_type,
    CASE WHEN v_session.caller_id = auth.uid() THEN 'outgoing' ELSE 'incoming' END,
    p_status,
    v_duration,
    v_session.started_at,
    v_session.ended_at
  );

  RETURN v_session;
END;
$$;

-- Function to get call history
CREATE OR REPLACE FUNCTION get_call_history(
  p_user_id UUID DEFAULT auth.uid(),
  p_limit INTEGER DEFAULT 50
)
RETURNS SETOF call_history
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM call_history
  WHERE caller_id = p_user_id OR callee_id = p_user_id
  ORDER BY started_at DESC
  LIMIT p_limit;
END;
$$;

-- Trigger to auto-end missed calls after 60 seconds
CREATE OR REPLACE FUNCTION auto_end_missed_calls()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session call_sessions%ROWTYPE;
BEGIN
  -- Find pending calls older than 60 seconds (ringing timeout)
  FOR v_session IN
    SELECT * FROM call_sessions
    WHERE status = 'pending'
    AND started_at < NOW() - INTERVAL '60 seconds'
  LOOP
    -- End call as missed
    PERFORM end_call(v_session.id, 'missed');
  END LOOP;

  -- Find ringing calls (callee not answered) older than 60 seconds
  FOR v_session IN
    SELECT * FROM call_sessions
    WHERE status = 'ringing'
    AND started_at < NOW() - INTERVAL '60 seconds'
  LOOP
    -- End call as missed
    PERFORM end_call(v_session.id, 'missed');
  END LOOP;
END;
$$;

-- Enable realtime for call_sessions
ALTER PUBLICATION supabase_realtime ADD TABLE call_sessions;
