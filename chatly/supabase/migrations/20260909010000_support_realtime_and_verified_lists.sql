-- Route support tickets to a chosen administrator and expose queue changes in realtime.

ALTER TABLE public.support_requests
  ADD COLUMN IF NOT EXISTS assigned_admin_id UUID
    REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS support_requests_assigned_queue_idx
  ON public.support_requests(assigned_admin_id, status, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION public.is_available_support_admin(p_admin_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = p_admin_id
      AND role = 'admin'
      AND NOT is_suspended
  );
$$;

DROP POLICY IF EXISTS support_requests_insert ON public.support_requests;
CREATE POLICY support_requests_insert
  ON public.support_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'open'
    AND admin_response IS NULL
    AND resolved_by IS NULL
    AND assigned_admin_id IS NOT NULL
    AND public.is_available_support_admin(assigned_admin_id)
  );

CREATE OR REPLACE FUNCTION public.get_support_admin_profiles()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN '[]'::JSONB
    ELSE COALESCE(
      JSONB_AGG(
        JSONB_BUILD_OBJECT(
          'id', profile.id,
          'username', profile.username,
          'display_name', profile.display_name,
          'avatar_url', profile.avatar_url,
          'is_verified', TRUE,
          'status', profile.status,
          'last_seen', profile.last_seen
        )
        ORDER BY profile.display_name, profile.created_at, profile.id
      ),
      '[]'::JSONB
    )
  END
  FROM public.profiles AS profile
  WHERE profile.role = 'admin' AND NOT profile.is_suspended;
$$;

-- Keep the existing singular RPC compatible with older clients.
CREATE OR REPLACE FUNCTION public.get_support_admin_profile()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN NULL ELSE JSONB_BUILD_OBJECT(
    'id', profile.id,
    'username', profile.username,
    'display_name', profile.display_name,
    'avatar_url', profile.avatar_url,
    'is_verified', TRUE,
    'status', profile.status,
    'last_seen', profile.last_seen
  ) END
  FROM public.profiles AS profile
  WHERE profile.role = 'admin' AND NOT profile.is_suspended
  ORDER BY profile.display_name, profile.created_at, profile.id
  LIMIT 1;
$$;

ALTER TABLE public.support_requests REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'support_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_requests;
  END IF;
END;
$$;

-- Conversation summaries must carry verification state for the active chat list.
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
          'push_sent_at', last_message.push_sent_at
        )
      END AS last_message,
      (
        SELECT COUNT(*)
        FROM public.messages AS unread
        WHERE unread.conversation_id = conversation.id
          AND unread.sender_id IS DISTINCT FROM auth.uid()
          AND unread.created_at > COALESCE(mine.last_read_at, 'epoch'::TIMESTAMPTZ)
      ) AS unread_count
    FROM public.conversation_participants AS mine
    JOIN public.conversations AS conversation ON conversation.id = mine.conversation_id
    LEFT JOIN LATERAL (
      SELECT message.*
      FROM public.messages AS message
      WHERE message.conversation_id = conversation.id
      ORDER BY message.created_at DESC
      LIMIT 1
    ) AS last_message ON TRUE
    LEFT JOIN LATERAL (
      SELECT profile.id, profile.username, profile.display_name, profile.avatar_url,
        profile.bio, profile.status, profile.last_seen, profile.created_at, profile.is_verified
      FROM public.conversation_participants AS other
      JOIN public.profiles AS profile ON profile.id = other.user_id
      WHERE other.conversation_id = conversation.id
        AND other.user_id <> auth.uid()
      ORDER BY other.joined_at
      LIMIT 1
    ) AS other_profile ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::INTEGER AS member_count
      FROM public.conversation_participants AS member
      WHERE member.conversation_id = conversation.id
    ) AS member_totals ON TRUE
    WHERE mine.user_id = auth.uid()
  ) AS summary;
$$;

REVOKE ALL ON FUNCTION public.is_available_support_admin(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_support_admin_profiles() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_support_admin_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_available_support_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_support_admin_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_support_admin_profile() TO authenticated;
