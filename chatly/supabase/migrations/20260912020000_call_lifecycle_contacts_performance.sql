-- Make call completion atomic, enforce a 45-second ring window, and load contacts in one query.

CREATE INDEX IF NOT EXISTS call_sessions_answered_started_idx
  ON public.call_sessions(started_at)
  WHERE status = 'answered';

CREATE OR REPLACE FUNCTION public.finalize_call_session(
  p_session_id UUID,
  p_status public.call_session_status,
  p_actor_id UUID DEFAULT NULL
)
RETURNS public.call_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.call_sessions;
  v_status public.call_session_status;
  v_ended_at TIMESTAMPTZ := NOW();
  v_duration INTEGER;
BEGIN
  SELECT * INTO v_session
  FROM public.call_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Call session not found';
  END IF;

  IF p_actor_id IS NOT NULL
     AND p_actor_id NOT IN (v_session.caller_id, v_session.callee_id) THEN
    RAISE EXCEPTION 'Not a participant of this call';
  END IF;

  IF v_session.ended_at IS NOT NULL THEN
    RETURN v_session;
  END IF;

  -- A late timeout from another device must not end a call that was already answered.
  IF v_session.status = 'answered' AND p_status IN ('missed', 'declined') THEN
    RETURN v_session;
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('declined', 'missed', 'ended', 'failed') THEN
    RAISE EXCEPTION 'Unsupported call status transition';
  END IF;

  v_status := CASE
    WHEN v_session.answered_at IS NOT NULL AND p_status IN ('missed', 'declined')
      THEN 'ended'::public.call_session_status
    WHEN p_status IN ('declined', 'missed', 'ended', 'failed') THEN p_status
    ELSE 'ended'::public.call_session_status
  END;
  v_duration := CASE
    WHEN v_session.answered_at IS NULL THEN 0
    ELSE GREATEST(FLOOR(EXTRACT(EPOCH FROM (v_ended_at - v_session.answered_at)))::INTEGER, 0)
  END;

  UPDATE public.call_sessions
  SET status = v_status,
      ended_at = v_ended_at,
      offer_sdp = NULL,
      answer_sdp = NULL,
      ice_candidates = '[]'::JSONB
  WHERE id = v_session.id
  RETURNING * INTO v_session;

  INSERT INTO public.call_history (
    session_id, caller_id, callee_id, conversation_id, call_type, direction,
    status, duration_seconds, started_at, ended_at
  ) VALUES (
    v_session.id, v_session.caller_id, v_session.callee_id, v_session.conversation_id,
    v_session.call_type, 'outgoing'::public.call_direction, v_status, v_duration,
    v_session.started_at, v_ended_at
  )
  ON CONFLICT (session_id) WHERE session_id IS NOT NULL DO UPDATE
  SET status = EXCLUDED.status,
      duration_seconds = EXCLUDED.duration_seconds,
      ended_at = EXCLUDED.ended_at;

  IF v_session.conversation_id IS NOT NULL THEN
    INSERT INTO public.messages (
      conversation_id, sender_id, content, content_type, status, created_at,
      call_session_id, metadata
    ) VALUES (
      v_session.conversation_id,
      v_session.caller_id,
      CASE WHEN v_status = 'missed' THEN 'Cuộc gọi nhỡ'
        WHEN v_status = 'declined' THEN 'Cuộc gọi bị từ chối'
        WHEN v_status = 'failed' THEN 'Cuộc gọi không kết nối được'
        WHEN v_session.answered_at IS NULL THEN 'Cuộc gọi đã hủy'
        ELSE 'Cuộc gọi đã kết thúc' END,
      'call'::public.message_content_type,
      'sent'::public.message_status,
      v_ended_at,
      v_session.id,
      JSONB_BUILD_OBJECT(
        'call_type', v_session.call_type,
        'status', v_status,
        'duration_seconds', v_duration,
        'answered', v_session.answered_at IS NOT NULL,
        'caller_id', v_session.caller_id,
        'callee_id', v_session.callee_id
      )
    )
    ON CONFLICT (call_session_id) WHERE call_session_id IS NOT NULL DO NOTHING;

    UPDATE public.conversations
    SET last_message_at = GREATEST(COALESCE(last_message_at, v_ended_at), v_ended_at),
        updated_at = GREATEST(COALESCE(updated_at, v_ended_at), v_ended_at)
    WHERE id = v_session.conversation_id;
  END IF;

  RETURN v_session;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_call_session(UUID, public.call_session_status, UUID)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.initiate_call(
  p_callee_id UUID,
  p_conversation_id UUID,
  p_call_type public.call_type DEFAULT 'voice'
)
RETURNS public.call_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.call_sessions;
  v_caller_id UUID := (SELECT auth.uid());
BEGIN
  IF v_caller_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_callee_id = v_caller_id THEN RAISE EXCEPTION 'Cannot call yourself'; END IF;
  IF p_callee_id IS NULL OR p_call_type IS NULL THEN RAISE EXCEPTION 'Invalid call'; END IF;

  PERFORM PG_ADVISORY_XACT_LOCK(HASHTEXT('call:' || LEAST(v_caller_id::TEXT, p_callee_id::TEXT)));
  PERFORM PG_ADVISORY_XACT_LOCK(HASHTEXT('call:' || GREATEST(v_caller_id::TEXT, p_callee_id::TEXT)));
  FOR v_session IN
    SELECT * FROM public.call_sessions
    WHERE status IN ('pending', 'ringing') AND started_at < NOW() - INTERVAL '45 seconds'
      AND (caller_id IN (v_caller_id, p_callee_id) OR callee_id IN (v_caller_id, p_callee_id))
    FOR UPDATE
  LOOP
    PERFORM public.finalize_call_session(v_session.id, 'missed', NULL);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = v_caller_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id AND user_id = p_callee_id
  ) THEN
    RAISE EXCEPTION 'Both users must participate in the conversation';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = v_caller_id AND blocked_id = p_callee_id)
       OR (blocker_id = p_callee_id AND blocked_id = v_caller_id)
  ) THEN
    RAISE EXCEPTION 'Calling is not available for this user';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id IN (v_caller_id, p_callee_id) AND is_suspended
  ) THEN
    RAISE EXCEPTION 'The recipient account is unavailable';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.call_sessions
    WHERE status IN ('pending', 'ringing', 'answered')
      AND (
        caller_id IN (v_caller_id, p_callee_id)
        OR callee_id IN (v_caller_id, p_callee_id)
      )
  ) THEN
    RAISE EXCEPTION 'One of the participants is already in a call';
  END IF;

  INSERT INTO public.call_sessions (
    caller_id, callee_id, conversation_id, call_type, status
  ) VALUES (
    v_caller_id, p_callee_id, p_conversation_id, p_call_type, 'pending'
  )
  RETURNING * INTO v_session;

  RETURN v_session;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_call_status(
  p_session_id UUID,
  p_status public.call_session_status,
  p_answer_sdp TEXT DEFAULT NULL
)
RETURNS public.call_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.call_sessions;
  v_actor_id UUID := (SELECT auth.uid());
BEGIN
  SELECT * INTO v_session
  FROM public.call_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_actor_id IS NULL OR v_session.id IS NULL
     OR v_actor_id NOT IN (v_session.caller_id, v_session.callee_id) THEN
    RAISE EXCEPTION 'Not a participant of this call';
  END IF;

  IF v_session.ended_at IS NOT NULL THEN RETURN v_session; END IF;

  IF p_status IN ('answered', 'declined') AND v_actor_id <> v_session.callee_id THEN
    RAISE EXCEPTION 'Only the recipient can answer or decline this call';
  END IF;

  IF p_status = 'answered' THEN
    IF v_session.status = 'answered' THEN RETURN v_session; END IF;
    IF v_session.status NOT IN ('pending', 'ringing')
       OR v_session.started_at < NOW() - INTERVAL '45 seconds' THEN
      RETURN public.finalize_call_session(p_session_id, 'missed', v_actor_id);
    END IF;

    UPDATE public.call_sessions
    SET status = 'answered',
        answer_sdp = COALESCE(p_answer_sdp, answer_sdp),
        answered_at = COALESCE(answered_at, NOW())
    WHERE id = p_session_id
    RETURNING * INTO v_session;
    RETURN v_session;
  END IF;

  IF p_status IN ('declined', 'missed', 'ended', 'failed') THEN
    RETURN public.finalize_call_session(p_session_id, p_status, v_actor_id);
  END IF;

  RAISE EXCEPTION 'Unsupported call status transition';
END;
$$;

CREATE OR REPLACE FUNCTION public.end_call(
  p_session_id UUID,
  p_status public.call_session_status DEFAULT 'ended'
)
RETURNS public.call_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := (SELECT auth.uid());
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  RETURN public.finalize_call_session(p_session_id, p_status, v_actor_id);
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
      AND started_at < NOW() - INTERVAL '45 seconds'
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.finalize_call_session(v_session.id, 'missed', NULL);
  END LOOP;

  FOR v_session IN
    SELECT *
    FROM public.call_sessions
    WHERE status = 'answered'
      AND started_at < NOW() - INTERVAL '12 hours'
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.finalize_call_session(v_session.id, 'failed', NULL);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_stale_calls_for_current_user()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.call_sessions%ROWTYPE;
  v_user_id UUID := (SELECT auth.uid());
  v_expired_count INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  FOR v_session IN
    SELECT *
    FROM public.call_sessions
    WHERE (caller_id = v_user_id OR callee_id = v_user_id)
      AND status IN ('pending', 'ringing')
      AND started_at < NOW() - INTERVAL '45 seconds'
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.finalize_call_session(v_session.id, 'missed', v_user_id);
    v_expired_count := v_expired_count + 1;
  END LOOP;

  RETURN v_expired_count;
END;
$$;

REVOKE ALL ON FUNCTION public.initiate_call(UUID, UUID, public.call_type) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_call_status(UUID, public.call_session_status, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.end_call(UUID, public.call_session_status) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_end_missed_calls() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_stale_calls_for_current_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.initiate_call(UUID, UUID, public.call_type) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_call_status(UUID, public.call_session_status, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_call(UUID, public.call_session_status) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_end_missed_calls() TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_stale_calls_for_current_user() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_friendship_overview(p_discover_limit INTEGER DEFAULT 50)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH request_context AS (
    SELECT (SELECT auth.uid()) AS user_id,
      LEAST(GREATEST(COALESCE(p_discover_limit, 50), 1), 100) AS discover_limit
  ),
  relation_rows AS MATERIALIZED (
    SELECT
      friendship.id,
      friendship.requester_id,
      friendship.addressee_id,
      friendship.status,
      CASE
        WHEN friendship.requester_id = request_context.user_id
          THEN friendship.addressee_id
        ELSE friendship.requester_id
      END AS related_user_id
    FROM request_context
    JOIN public.friendships AS friendship
      ON friendship.requester_id = request_context.user_id
      OR friendship.addressee_id = request_context.user_id
    WHERE request_context.user_id IS NOT NULL
  ),
  relation_items AS (
    SELECT
      relation.id,
      relation.requester_id,
      relation.addressee_id,
      relation.status,
      JSONB_BUILD_OBJECT(
        'id', relation.id,
        'requesterId', relation.requester_id,
        'addresseeId', relation.addressee_id,
        'status', relation.status,
        'profile', JSONB_BUILD_OBJECT(
          'id', profile.id,
          'username', profile.username,
          'display_name', profile.display_name,
          'avatar_url', profile.avatar_url,
          'bio', profile.bio,
          'status', profile.status,
          'last_seen', profile.last_seen,
          'created_at', profile.created_at,
          'is_verified', profile.is_verified
        )
      ) AS item
    FROM relation_rows AS relation
    JOIN public.profiles AS profile ON profile.id = relation.related_user_id
  ),
  discovery AS (
    SELECT JSONB_BUILD_OBJECT(
      'id', profile.id,
      'username', profile.username,
      'display_name', profile.display_name,
      'avatar_url', profile.avatar_url,
      'bio', profile.bio,
      'status', profile.status,
      'last_seen', profile.last_seen,
      'created_at', profile.created_at,
      'is_verified', profile.is_verified
    ) AS profile
    FROM request_context
    JOIN public.profiles AS profile ON profile.id <> request_context.user_id
    WHERE request_context.user_id IS NOT NULL
      AND NOT profile.is_suspended
      AND NOT EXISTS (
        SELECT 1 FROM public.user_blocks AS block
        WHERE (block.blocker_id = request_context.user_id AND block.blocked_id = profile.id)
           OR (block.blocked_id = request_context.user_id AND block.blocker_id = profile.id)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM relation_rows AS relation
        WHERE relation.related_user_id = profile.id
          AND relation.status <> 'declined'
      )
    ORDER BY profile.display_name, profile.id
    LIMIT (SELECT discover_limit FROM request_context)
  )
  SELECT CASE
    WHEN request_context.user_id IS NULL THEN NULL
    ELSE JSONB_BUILD_OBJECT(
      'currentUserId', request_context.user_id,
      'friends', COALESCE(
        JSONB_AGG(relation_items.item ORDER BY profile.display_name, relation_items.id)
          FILTER (WHERE relation_items.status = 'accepted'),
        '[]'::JSONB
      ),
      'incoming', COALESCE(
        JSONB_AGG(relation_items.item ORDER BY profile.display_name, relation_items.id)
          FILTER (
            WHERE relation_items.status = 'pending'
              AND relation_items.addressee_id = request_context.user_id
          ),
        '[]'::JSONB
      ),
      'outgoing', COALESCE(
        JSONB_AGG(relation_items.item ORDER BY profile.display_name, relation_items.id)
          FILTER (
            WHERE relation_items.status = 'pending'
              AND relation_items.requester_id = request_context.user_id
          ),
        '[]'::JSONB
      ),
      'discover', (SELECT COALESCE(JSONB_AGG(discovery.profile), '[]'::JSONB) FROM discovery)
    )
  END
  FROM request_context
  LEFT JOIN relation_items ON TRUE
  LEFT JOIN public.profiles AS profile
    ON profile.id = CASE
      WHEN relation_items.requester_id = request_context.user_id
        THEN relation_items.addressee_id
      ELSE relation_items.requester_id
    END
  GROUP BY request_context.user_id;
$$;

REVOKE ALL ON FUNCTION public.get_friendship_overview(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friendship_overview(INTEGER) TO authenticated;

-- Repair earlier terminal sessions that were not written to history (notably declined calls).
INSERT INTO public.call_history (
  session_id, caller_id, callee_id, conversation_id, call_type, direction,
  status, duration_seconds, started_at, ended_at
)
SELECT
  session.id,
  session.caller_id,
  session.callee_id,
  session.conversation_id,
  session.call_type,
  'outgoing'::public.call_direction,
  CASE
    WHEN session.status IN ('declined', 'missed', 'ended', 'failed') THEN session.status
    ELSE 'ended'::public.call_session_status
  END,
  CASE
    WHEN session.answered_at IS NULL OR session.ended_at IS NULL THEN 0
    ELSE GREATEST(EXTRACT(EPOCH FROM (session.ended_at - session.answered_at))::INTEGER, 0)
  END,
  session.started_at,
  COALESCE(session.ended_at, session.started_at)
FROM public.call_sessions AS session
LEFT JOIN public.call_history AS history ON history.session_id = session.id
WHERE session.ended_at IS NOT NULL
  AND history.id IS NULL
ON CONFLICT (session_id) WHERE session_id IS NOT NULL DO NOTHING;

INSERT INTO public.messages (
  conversation_id, sender_id, content, content_type, status, created_at,
  call_session_id, metadata
)
SELECT
  history.conversation_id,
  history.caller_id,
  CASE WHEN history.status = 'missed' THEN 'Cuộc gọi nhỡ'
    WHEN history.status = 'declined' THEN 'Cuộc gọi bị từ chối'
    WHEN history.status = 'failed' THEN 'Cuộc gọi không kết nối được'
    ELSE 'Cuộc gọi đã kết thúc' END,
  'call'::public.message_content_type,
  'sent'::public.message_status,
  COALESCE(history.ended_at, history.started_at, history.created_at, NOW()),
  history.session_id,
  JSONB_BUILD_OBJECT(
    'call_type', history.call_type,
    'status', history.status,
    'duration_seconds', COALESCE(history.duration_seconds, 0),
    'answered', session.answered_at IS NOT NULL,
    'caller_id', history.caller_id,
    'callee_id', history.callee_id
  )
FROM public.call_history AS history
JOIN public.call_sessions AS session ON session.id = history.session_id
WHERE history.session_id IS NOT NULL
  AND history.conversation_id IS NOT NULL
ON CONFLICT (call_session_id) WHERE call_session_id IS NOT NULL DO NOTHING;

UPDATE public.call_sessions
SET offer_sdp = NULL,
    answer_sdp = NULL,
    ice_candidates = '[]'::JSONB
WHERE ended_at IS NOT NULL
  AND (offer_sdp IS NOT NULL OR answer_sdp IS NOT NULL OR ice_candidates <> '[]'::JSONB);

UPDATE public.conversations AS conversation
SET last_message_at = latest.created_at,
    updated_at = GREATEST(COALESCE(conversation.updated_at, latest.created_at), latest.created_at)
FROM (
  SELECT message.conversation_id, MAX(message.created_at) AS created_at
  FROM public.messages AS message
  WHERE message.conversation_id IS NOT NULL
  GROUP BY message.conversation_id
) AS latest
WHERE conversation.id = latest.conversation_id
  AND latest.created_at > COALESCE(conversation.last_message_at, '-infinity'::TIMESTAMPTZ);

-- Return call metadata in chat-list summaries.
CREATE OR REPLACE FUNCTION public.get_conversation_summaries()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    JSONB_AGG(TO_JSONB(summary) - 'activity_at' ORDER BY is_pinned DESC, activity_at DESC),
    '[]'::JSONB
  )
  FROM (
    SELECT
      conversation.id,
      conversation.type,
      conversation.title,
      conversation.avatar_url,
      conversation.created_by,
      conversation.last_message_at,
      conversation.created_at,
      conversation.updated_at,
      conversation.share_token,
      conversation.join_requires_approval,
      mine.is_pinned,
      mine.is_muted,
      mine.is_archived,
      GREATEST(
        COALESCE(last_message.created_at, '-infinity'::TIMESTAMPTZ),
        COALESCE(conversation.last_message_at, '-infinity'::TIMESTAMPTZ)
      ) AS activity_at,
      COALESCE(member_totals.member_count, 0) AS member_count,
      CASE
        WHEN conversation.type = 'direct' AND other_profile.id IS NOT NULL THEN
          JSONB_BUILD_OBJECT(
            'id', other_profile.id,
            'username', other_profile.username,
            'display_name', other_profile.display_name,
            'avatar_url', other_profile.avatar_url,
            'bio', other_profile.bio,
            'status', other_profile.status,
            'last_seen', other_profile.last_seen,
            'created_at', other_profile.created_at,
            'is_verified', other_profile.is_verified
          )
        ELSE NULL
      END AS participant,
      CASE
        WHEN last_message.id IS NULL THEN NULL
        ELSE JSONB_BUILD_OBJECT(
          'id', last_message.id,
          'conversation_id', last_message.conversation_id,
          'sender_id', last_message.sender_id,
          'content', last_message.content,
          'content_type', last_message.content_type,
          'status', last_message.status,
          'created_at', last_message.created_at,
          'edited_at', last_message.edited_at,
          'deleted_at', last_message.deleted_at,
          'reply_to', last_message.reply_to,
          'media_url', last_message.media_url,
          'media_thumbnail_url', last_message.media_thumbnail_url,
          'media_name', last_message.media_name,
          'media_size', last_message.media_size,
          'media_mime_type', last_message.media_mime_type,
          'media_group_id', last_message.media_group_id,
          'push_sent_at', last_message.push_sent_at,
          'call_session_id', last_message.call_session_id,
          'metadata', last_message.metadata
        )
      END AS last_message,
      (
        SELECT COUNT(*)
        FROM public.messages AS unread
        WHERE unread.conversation_id = conversation.id
          AND unread.sender_id IS DISTINCT FROM (SELECT auth.uid())
          AND unread.created_at > COALESCE(mine.last_read_at, 'epoch'::TIMESTAMPTZ)
      ) AS unread_count
    FROM public.conversation_participants AS mine
    JOIN public.conversations AS conversation ON conversation.id = mine.conversation_id
    LEFT JOIN LATERAL (
      SELECT message.*
      FROM public.messages AS message
      WHERE message.conversation_id = conversation.id
      ORDER BY message.created_at DESC, message.id DESC
      LIMIT 1
    ) AS last_message ON TRUE
    LEFT JOIN LATERAL (
      SELECT profile.id, profile.username, profile.display_name, profile.avatar_url,
        profile.bio, profile.status, profile.last_seen, profile.created_at, profile.is_verified
      FROM public.conversation_participants AS other
      JOIN public.profiles AS profile ON profile.id = other.user_id
      WHERE other.conversation_id = conversation.id
        AND other.user_id <> (SELECT auth.uid())
      ORDER BY other.joined_at
      LIMIT 1
    ) AS other_profile ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::INTEGER AS member_count
      FROM public.conversation_participants AS member
      WHERE member.conversation_id = conversation.id
    ) AS member_totals ON TRUE
    WHERE mine.user_id = (SELECT auth.uid())
  ) AS summary;
$$;

REVOKE ALL ON FUNCTION public.get_conversation_summaries() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_conversation_summaries() TO authenticated;

-- Run time-sensitive cleanup even when both browsers are closed.
DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    SELECT jobid INTO v_job_id
    FROM cron.job
    WHERE jobname = 'chatly-auto-end-missed-calls';

    IF v_job_id IS NOT NULL THEN PERFORM cron.unschedule(v_job_id); END IF;

    PERFORM cron.schedule(
      'chatly-auto-end-missed-calls',
      '5 seconds',
      'SELECT public.auto_end_missed_calls();'
    );
  END IF;
EXCEPTION
  WHEN undefined_table OR undefined_function OR invalid_schema_name THEN
    RAISE NOTICE 'pg_cron is unavailable; clients will expire their own stale calls';
END$$;

ANALYZE public.messages;
ANALYZE public.call_sessions;
ANALYZE public.call_history;
ANALYZE public.friendships;

-- Call state and history are written only by the authenticated lifecycle RPCs.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.call_sessions, public.call_history FROM anon, authenticated;
REVOKE SELECT ON public.call_sessions, public.call_history FROM anon;
GRANT SELECT ON public.call_sessions, public.call_history TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_call_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' AND (NEW.content_type = 'call' OR NEW.call_session_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Call messages are created by the call service';
    END IF;
    IF TG_OP = 'UPDATE' AND (
      NEW.metadata IS DISTINCT FROM OLD.metadata
      OR NEW.call_session_id IS DISTINCT FROM OLD.call_session_id
      OR (OLD.content_type = 'call' AND (
        NEW.content IS DISTINCT FROM OLD.content OR NEW.content_type IS DISTINCT FROM OLD.content_type
      ))
    ) THEN RAISE EXCEPTION 'Call metadata is immutable'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_call_message() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER protect_call_message_trigger BEFORE INSERT OR UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.protect_call_message();

ALTER TABLE public.messages VALIDATE CONSTRAINT messages_metadata_object;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'call_history'
  ) THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.call_history; END IF;
END;
$$;

-- Sub-minute cleanup must not accumulate unbounded cron execution logs.
SELECT cron.schedule('chatly-trim-call-cron-logs', '15 3 * * *',
  $job$DELETE FROM cron.job_run_details WHERE jobid IN (
    SELECT jobid FROM cron.job WHERE jobname IN ('chatly-auto-end-missed-calls', 'chatly-trim-call-cron-logs')
  ) AND end_time < NOW() - INTERVAL '7 days'$job$);
