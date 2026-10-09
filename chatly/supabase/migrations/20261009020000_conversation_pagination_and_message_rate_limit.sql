-- Return only one bounded conversation-list page and prevent message floods.

CREATE OR REPLACE FUNCTION public.get_conversation_summaries_page(
  p_limit INTEGER DEFAULT 80,
  p_offset INTEGER DEFAULT 0,
  p_tab TEXT DEFAULT 'all',
  p_query TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 80), 1), 100);
  v_offset INTEGER := LEAST(GREATEST(COALESCE(p_offset, 0), 0), 1000000);
  v_tab TEXT := COALESCE(p_tab, 'all');
  v_query TEXT := LOWER(LEFT(BTRIM(COALESCE(p_query, '')), 200));
  v_total_count BIGINT;
  v_items JSONB;
  v_has_more BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF v_tab NOT IN ('all', 'unread', 'groups', 'archived') THEN
    RAISE EXCEPTION 'Invalid conversation tab';
  END IF;

  WITH candidates AS MATERIALIZED (
    SELECT
      conversation.id,
      conversation.type,
      conversation.title,
      conversation.avatar_url,
      conversation.created_by,
      conversation.ai_agent_id,
      conversation.last_message_at,
      conversation.created_at,
      conversation.updated_at,
      conversation.share_token,
      conversation.join_requires_approval,
      mine.last_read_at,
      mine.is_pinned,
      mine.is_muted,
      mine.is_archived,
      GREATEST(
        COALESCE(latest_activity.created_at, '-infinity'::TIMESTAMPTZ),
        COALESCE(conversation.last_message_at, '-infinity'::TIMESTAMPTZ)
      ) AS activity_at
    FROM public.conversation_participants AS mine
    JOIN public.conversations AS conversation ON conversation.id = mine.conversation_id
    LEFT JOIN LATERAL (
      SELECT message.created_at
      FROM public.messages AS message
      WHERE message.conversation_id = conversation.id
      ORDER BY message.created_at DESC, message.id DESC
      LIMIT 1
    ) AS latest_activity ON TRUE
    WHERE mine.user_id = v_user_id
      AND COALESCE(mine.is_archived, FALSE) = (v_tab = 'archived')
      AND (v_tab <> 'groups' OR conversation.type = 'group')
      AND (
        v_tab <> 'unread'
        OR EXISTS (
          SELECT 1
          FROM public.messages AS unread
          WHERE unread.conversation_id = conversation.id
            AND unread.sender_id IS DISTINCT FROM v_user_id
            AND unread.created_at > COALESCE(mine.last_read_at, 'epoch'::TIMESTAMPTZ)
        )
      )
      AND (
        v_query = ''
        OR POSITION(v_query IN LOWER(COALESCE(conversation.title, ''))) > 0
        OR EXISTS (
          SELECT 1
          FROM public.conversation_participants AS other
          JOIN public.profiles AS profile ON profile.id = other.user_id
          WHERE other.conversation_id = conversation.id
            AND other.user_id <> v_user_id
            AND (
              POSITION(v_query IN LOWER(COALESCE(profile.display_name, ''))) > 0
              OR (
                NULLIF(LTRIM(v_query, '@'), '') IS NOT NULL
                AND POSITION(
                  LTRIM(v_query, '@') IN LOWER(COALESCE(profile.username, ''))
                ) > 0
              )
            )
        )
        OR EXISTS (
          SELECT 1
          FROM public.ai_agents AS matching_agent
          WHERE matching_agent.id = conversation.ai_agent_id
            AND POSITION(v_query IN LOWER(matching_agent.name)) > 0
        )
      )
  ),
  page AS (
    SELECT candidate.*
    FROM candidates AS candidate
    ORDER BY candidate.is_pinned DESC NULLS LAST, candidate.activity_at DESC, candidate.id DESC
    LIMIT v_limit + 1
    OFFSET v_offset
  ),
  bounded_page AS (
    SELECT page.*
    FROM page
    ORDER BY page.is_pinned DESC NULLS LAST, page.activity_at DESC, page.id DESC
    LIMIT v_limit
  ),
  summaries AS (
    SELECT
      page.*,
      (SELECT agent.name FROM public.ai_agents AS agent WHERE agent.id = page.ai_agent_id)
        AS ai_agent_name,
      other_profile.id AS participant_id,
      other_profile.username AS participant_username,
      other_profile.display_name AS participant_display_name,
      other_profile.avatar_url AS participant_avatar_url,
      other_profile.bio AS participant_bio,
      other_profile.status AS participant_status,
      other_profile.last_seen AS participant_last_seen,
      other_profile.created_at AS participant_created_at,
      other_profile.is_verified AS participant_is_verified,
      COALESCE(member_totals.member_count, 0) AS member_count,
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
        WHERE unread.conversation_id = page.id
          AND unread.sender_id IS DISTINCT FROM v_user_id
          AND unread.created_at > COALESCE(page.last_read_at, 'epoch'::TIMESTAMPTZ)
      ) AS unread_count
    FROM bounded_page AS page
    LEFT JOIN LATERAL (
      SELECT profile.id, profile.username, profile.display_name, profile.avatar_url,
        profile.bio, profile.status, profile.last_seen, profile.created_at, profile.is_verified
      FROM public.conversation_participants AS other
      JOIN public.profiles AS profile ON profile.id = other.user_id
      WHERE page.type = 'direct'
        AND other.conversation_id = page.id
        AND other.user_id <> v_user_id
      ORDER BY other.joined_at
      LIMIT 1
    ) AS other_profile ON TRUE
    LEFT JOIN LATERAL (
      SELECT message.*
      FROM public.messages AS message
      WHERE message.conversation_id = page.id
      ORDER BY message.created_at DESC, message.id DESC
      LIMIT 1
    ) AS last_message ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::INTEGER AS member_count
      FROM public.conversation_participants AS member
      WHERE member.conversation_id = page.id
    ) AS member_totals ON TRUE
  )
  SELECT
    CASE WHEN v_tab = 'archived' THEN (SELECT COUNT(*) FROM candidates) ELSE NULL END,
    COALESCE(
      (
        SELECT JSONB_AGG(
          JSONB_BUILD_OBJECT(
            'id', summary.id,
            'type', summary.type,
            'title', summary.title,
            'avatar_url', summary.avatar_url,
            'created_by', summary.created_by,
            'ai_agent_id', summary.ai_agent_id,
            'ai_agent_name', summary.ai_agent_name,
            'last_message_at', summary.last_message_at,
            'created_at', summary.created_at,
            'updated_at', summary.updated_at,
            'share_token', summary.share_token,
            'join_requires_approval', summary.join_requires_approval,
            'is_pinned', summary.is_pinned,
            'is_muted', summary.is_muted,
            'is_archived', summary.is_archived,
            'member_count', summary.member_count,
            'participant', CASE
              WHEN summary.type = 'direct' AND summary.participant_id IS NOT NULL THEN
                JSONB_BUILD_OBJECT(
                  'id', summary.participant_id,
                  'username', summary.participant_username,
                  'display_name', summary.participant_display_name,
                  'avatar_url', summary.participant_avatar_url,
                  'bio', summary.participant_bio,
                  'status', summary.participant_status,
                  'last_seen', summary.participant_last_seen,
                  'created_at', summary.participant_created_at,
                  'is_verified', summary.participant_is_verified
                )
              ELSE NULL
            END,
            'last_message', summary.last_message,
            'unread_count', summary.unread_count
          )
          ORDER BY summary.is_pinned DESC NULLS LAST, summary.activity_at DESC, summary.id DESC
        )
        FROM summaries AS summary
      ),
      '[]'::JSONB
    ),
    (SELECT COUNT(*) > v_limit FROM page)
  INTO v_total_count, v_items, v_has_more;

  RETURN JSONB_BUILD_OBJECT(
    'items', v_items,
    'total_count', v_total_count,
    'has_more', v_has_more
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_conversation_summaries_page(INTEGER, INTEGER, TEXT, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_conversation_summaries_page(INTEGER, INTEGER, TEXT, TEXT)
  TO authenticated;

CREATE TABLE IF NOT EXISTS public.message_send_limits (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  window_started_at TIMESTAMPTZ NOT NULL,
  message_count INTEGER NOT NULL CHECK (message_count > 0)
);

ALTER TABLE public.message_send_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.message_send_limits FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.limit_authenticated_message_rate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_now TIMESTAMPTZ := clock_timestamp();
  v_message_count INTEGER;
BEGIN
  -- Count human-authored writes even when a trusted worker sends them later.
  IF NEW.sender_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF v_user_id IS NOT NULL AND NEW.sender_id IS DISTINCT FROM v_user_id THEN
    RETURN NEW;
  END IF;
  v_user_id := NEW.sender_id;

  INSERT INTO public.message_send_limits AS limits (
    user_id, window_started_at, message_count
  )
  VALUES (v_user_id, v_now, 1)
  ON CONFLICT (user_id) DO UPDATE
  SET
    window_started_at = CASE
      WHEN limits.window_started_at <= v_now - INTERVAL '10 seconds' THEN v_now
      ELSE limits.window_started_at
    END,
    message_count = CASE
      WHEN limits.window_started_at <= v_now - INTERVAL '10 seconds' THEN 1
      ELSE limits.message_count + 1
    END
  RETURNING message_count INTO v_message_count;

  IF v_message_count > 20 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'MESSAGE_RATE_LIMITED';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.limit_authenticated_message_rate() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS limit_authenticated_message_rate_trigger ON public.messages;
CREATE TRIGGER limit_authenticated_message_rate_trigger
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.limit_authenticated_message_rate();
