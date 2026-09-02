-- Security and scale hardening for messaging, storage, and scheduled delivery.

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_group_id UUID;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS push_sent_at TIMESTAMPTZ;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_content_length_check
  CHECK (char_length(content) BETWEEN 1 AND 10000) NOT VALID;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_media_size_check
  CHECK (media_size IS NULL OR media_size BETWEEN 0 AND 52428800) NOT VALID;

ALTER TABLE public.scheduled_messages
  ADD CONSTRAINT scheduled_messages_content_length_check
  CHECK (char_length(content) BETWEEN 1 AND 10000) NOT VALID;

ALTER TABLE public.scheduled_messages
  ADD CONSTRAINT scheduled_messages_content_type_check
  CHECK (content_type IN ('text', 'image', 'video', 'audio', 'file')) NOT VALID;

ALTER TABLE public.scheduled_messages
  ADD CONSTRAINT scheduled_messages_media_size_check
  CHECK (media_size IS NULL OR media_size BETWEEN 0 AND 52428800) NOT VALID;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_title_length_check
  CHECK (title IS NULL OR char_length(title) BETWEEN 1 AND 100) NOT VALID;

ALTER TABLE public.conversation_labels
  ADD CONSTRAINT conversation_labels_name_length_check
  CHECK (char_length(name) BETWEEN 1 AND 100) NOT VALID;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_display_name_length_check
  CHECK (char_length(display_name) BETWEEN 1 AND 100) NOT VALID;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_bio_length_check
  CHECK (bio IS NULL OR char_length(bio) <= 500) NOT VALID;

CREATE INDEX IF NOT EXISTS messages_pending_status_idx
  ON public.messages(conversation_id, sender_id)
  WHERE status <> 'read';

ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;

-- Phone numbers are private account data, not public profile data.
REVOKE SELECT ON TABLE public.profiles FROM anon, authenticated;
GRANT SELECT (
  id, username, display_name, avatar_url, bio, last_seen, created_at, updated_at,
  status, role, is_suspended
) ON TABLE public.profiles TO authenticated;
REVOKE INSERT, UPDATE ON TABLE public.profiles FROM authenticated;
GRANT UPDATE (
  display_name, avatar_url, bio, phone, last_seen, updated_at, status
) ON TABLE public.profiles TO authenticated;

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
            'created_at', other_profile.created_at
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
        profile.bio, profile.status, profile.last_seen, profile.created_at
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

CREATE OR REPLACE FUNCTION public.can_send_message(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND public.is_conversation_participant(p_conversation_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.conversations AS conversation
      JOIN public.conversation_participants AS other
        ON other.conversation_id = conversation.id
       AND other.user_id <> auth.uid()
      JOIN public.user_blocks AS block
        ON (block.blocker_id = auth.uid() AND block.blocked_id = other.user_id)
        OR (block.blocker_id = other.user_id AND block.blocked_id = auth.uid())
      WHERE conversation.id = p_conversation_id
        AND conversation.type = 'direct'
    );
$$;

DROP POLICY IF EXISTS messages_insert ON public.messages;
CREATE POLICY messages_insert
  ON public.messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.can_send_message(conversation_id)
  );

CREATE OR REPLACE FUNCTION public.enforce_message_write_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reply_conversation_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.reply_to IS NOT NULL THEN
      SELECT conversation_id INTO v_reply_conversation_id
      FROM public.messages
      WHERE id = NEW.reply_to;

      IF v_reply_conversation_id IS DISTINCT FROM NEW.conversation_id THEN
        RAISE EXCEPTION 'Reply message must belong to the same conversation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Internal jobs and trigger chains do not carry an end-user identity.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.reply_to IS DISTINCT FROM OLD.reply_to
     OR NEW.content_type IS DISTINCT FROM OLD.content_type
     OR NEW.media_url IS DISTINCT FROM OLD.media_url
     OR NEW.media_thumbnail_url IS DISTINCT FROM OLD.media_thumbnail_url
     OR NEW.media_name IS DISTINCT FROM OLD.media_name
     OR NEW.media_size IS DISTINCT FROM OLD.media_size
     OR NEW.media_mime_type IS DISTINCT FROM OLD.media_mime_type
     OR NEW.media_group_id IS DISTINCT FROM OLD.media_group_id
     OR NEW.push_sent_at IS DISTINCT FROM OLD.push_sent_at
  THEN
    RAISE EXCEPTION 'Immutable message fields cannot be changed';
  END IF;

  IF OLD.sender_id = auth.uid() THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Senders cannot change delivery status';
    END IF;
    IF (NEW.content IS DISTINCT FROM OLD.content OR NEW.edited_at IS DISTINCT FROM OLD.edited_at)
       AND OLD.created_at < NOW() - INTERVAL '15 minutes'
    THEN
      RAISE EXCEPTION 'Messages can only be edited within 15 minutes';
    END IF;
    IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
       AND (OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NULL)
    THEN
      RAISE EXCEPTION 'Deleted messages cannot be restored';
    END IF;
    RETURN NEW;
  END IF;

  IF public.is_conversation_participant(OLD.conversation_id)
     AND NEW.content IS NOT DISTINCT FROM OLD.content
     AND NEW.edited_at IS NOT DISTINCT FROM OLD.edited_at
     AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at
     AND (
       (OLD.status = 'sent' AND NEW.status IN ('delivered', 'read'))
       OR (OLD.status = 'delivered' AND NEW.status = 'read')
       OR NEW.status IS NOT DISTINCT FROM OLD.status
     )
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Not authorized to update this message';
END;
$$;

DROP TRIGGER IF EXISTS enforce_message_write_rules_trigger ON public.messages;
CREATE TRIGGER enforce_message_write_rules_trigger
  BEFORE INSERT OR UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_message_write_rules();

CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(p_other_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation_id UUID;
  v_lock_key TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_other_user_id IS NULL OR p_other_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Select another user';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_other_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  v_lock_key := LEAST(auth.uid()::TEXT, p_other_user_id::TEXT)
    || ':' || GREATEST(auth.uid()::TEXT, p_other_user_id::TEXT);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));

  SELECT conversation.id INTO v_conversation_id
  FROM public.conversations AS conversation
  JOIN public.conversation_participants AS mine
    ON mine.conversation_id = conversation.id AND mine.user_id = auth.uid()
  JOIN public.conversation_participants AS other
    ON other.conversation_id = conversation.id AND other.user_id = p_other_user_id
  WHERE conversation.type = 'direct'
  ORDER BY conversation.created_at
  LIMIT 1;

  IF v_conversation_id IS NOT NULL THEN
    RETURN v_conversation_id;
  END IF;

  IF NOT public.are_friends(auth.uid(), p_other_user_id) THEN
    RAISE EXCEPTION 'Only accepted friends can start a conversation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = auth.uid() AND blocked_id = p_other_user_id)
       OR (blocker_id = p_other_user_id AND blocked_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Conversation is unavailable';
  END IF;

  INSERT INTO public.conversations(type, created_by)
  VALUES ('direct', auth.uid())
  RETURNING id INTO v_conversation_id;

  INSERT INTO public.conversation_participants(conversation_id, user_id, role)
  VALUES
    (v_conversation_id, auth.uid(), 'member'),
    (v_conversation_id, p_other_user_id, 'member');

  RETURN v_conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation_type public.conversation_type;
  v_updated_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_conversation_participant(p_conversation_id) THEN
    RAISE EXCEPTION 'Not authorized to read this conversation';
  END IF;

  UPDATE public.conversation_participants
  SET last_read_at = NOW()
  WHERE conversation_id = p_conversation_id
    AND user_id = auth.uid();

  SELECT type INTO v_conversation_type
  FROM public.conversations
  WHERE id = p_conversation_id;

  -- A single status column is meaningful only for direct chats. Group unread state
  -- is tracked per participant through last_read_at.
  IF v_conversation_type = 'direct' THEN
    UPDATE public.messages
    SET status = 'read'
    WHERE conversation_id = p_conversation_id
      AND sender_id IS DISTINCT FROM auth.uid()
      AND status <> 'read';
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  END IF;

  RETURN v_updated_count;
END;
$$;

DROP POLICY IF EXISTS "Users can upload chat media" ON storage.objects;
CREATE POLICY "Users can upload chat media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND auth.uid()::TEXT = (storage.foldername(name))[1]
    AND CASE
      WHEN (storage.foldername(name))[2]
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN public.is_conversation_participant(((storage.foldername(name))[2])::UUID)
      ELSE FALSE
    END
  );

DROP POLICY IF EXISTS "Participants can view chat media" ON storage.objects;
CREATE POLICY "Participants can view chat media"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND CASE
      WHEN (storage.foldername(name))[2]
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN public.is_conversation_participant(((storage.foldername(name))[2])::UUID)
      ELSE FALSE
    END
  );

DROP POLICY IF EXISTS "Users manage labels for their conversations"
  ON public.conversation_label_map;
CREATE POLICY "Users manage labels for their conversations"
  ON public.conversation_label_map FOR ALL
  TO authenticated
  USING (
    public.is_conversation_participant(conversation_id)
    AND EXISTS (
      SELECT 1 FROM public.conversation_labels
      WHERE id = label_id AND user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_conversation_participant(conversation_id)
    AND EXISTS (
      SELECT 1 FROM public.conversation_labels
      WHERE id = label_id AND user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.send_scheduled_message(scheduled_message_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message public.scheduled_messages%ROWTYPE;
  v_sent_message_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_message
  FROM public.scheduled_messages
  WHERE id = scheduled_message_id
    AND sender_id = auth.uid()
    AND status = 'pending'
    AND scheduled_at <= NOW()
  FOR UPDATE;

  IF v_message.id IS NULL THEN
    RAISE EXCEPTION 'Scheduled message not found or already processed';
  END IF;
  IF NOT public.can_send_message(v_message.conversation_id) THEN
    RAISE EXCEPTION 'Not authorized to send to this conversation';
  END IF;

  INSERT INTO public.messages (
    conversation_id, sender_id, content, content_type, media_url,
    media_thumbnail_url, media_name, media_size, media_mime_type, reply_to, status
  ) VALUES (
    v_message.conversation_id, v_message.sender_id, v_message.content,
    v_message.content_type::public.message_content_type, v_message.media_url,
    v_message.media_thumbnail_url, v_message.media_name, v_message.media_size,
    v_message.media_mime_type, v_message.reply_to, 'sent'
  ) RETURNING id INTO v_sent_message_id;

  UPDATE public.conversations
  SET last_message_at = NOW()
  WHERE id = v_message.conversation_id;

  UPDATE public.scheduled_messages
  SET status = 'sent', updated_at = NOW()
  WHERE id = scheduled_message_id;

  RETURN v_sent_message_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_due_scheduled_messages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message public.scheduled_messages%ROWTYPE;
BEGIN
  UPDATE public.scheduled_messages AS scheduled
  SET status = 'cancelled', updated_at = NOW()
  WHERE scheduled.status = 'pending'
    AND scheduled.scheduled_at <= NOW()
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.conversation_participants AS participant
        WHERE participant.conversation_id = scheduled.conversation_id
          AND participant.user_id = scheduled.sender_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.conversations AS conversation
        JOIN public.conversation_participants AS other
          ON other.conversation_id = conversation.id
         AND other.user_id <> scheduled.sender_id
        JOIN public.user_blocks AS block
          ON (block.blocker_id = scheduled.sender_id AND block.blocked_id = other.user_id)
          OR (block.blocker_id = other.user_id AND block.blocked_id = scheduled.sender_id)
        WHERE conversation.id = scheduled.conversation_id
          AND conversation.type = 'direct'
      )
      OR scheduled.content_type IS NULL
      OR scheduled.content_type NOT IN ('text', 'image', 'video', 'audio', 'file')
      OR scheduled.media_size < 0
      OR scheduled.media_size > 52428800
      OR (
        scheduled.reply_to IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.messages AS replied
          WHERE replied.id = scheduled.reply_to
            AND replied.conversation_id = scheduled.conversation_id
        )
      )
    );

  FOR v_message IN
    SELECT scheduled.*
    FROM public.scheduled_messages AS scheduled
    WHERE scheduled.status = 'pending'
      AND scheduled.scheduled_at <= NOW()
      AND NOT EXISTS (
        SELECT 1
        FROM public.conversations AS conversation
        JOIN public.conversation_participants AS other
          ON other.conversation_id = conversation.id
         AND other.user_id <> scheduled.sender_id
        JOIN public.user_blocks AS block
          ON (block.blocker_id = scheduled.sender_id AND block.blocked_id = other.user_id)
          OR (block.blocker_id = other.user_id AND block.blocked_id = scheduled.sender_id)
        WHERE conversation.id = scheduled.conversation_id
          AND conversation.type = 'direct'
      )
    ORDER BY scheduled.scheduled_at
    FOR UPDATE SKIP LOCKED
  LOOP
    INSERT INTO public.messages (
      conversation_id, sender_id, content, content_type, media_url,
      media_thumbnail_url, media_name, media_size, media_mime_type, reply_to, status
    ) VALUES (
      v_message.conversation_id, v_message.sender_id, v_message.content,
      v_message.content_type::public.message_content_type, v_message.media_url,
      v_message.media_thumbnail_url, v_message.media_name, v_message.media_size,
      v_message.media_mime_type, v_message.reply_to, 'sent'
    );

    UPDATE public.conversations
    SET last_message_at = NOW()
    WHERE id = v_message.conversation_id;

    UPDATE public.scheduled_messages
    SET status = 'sent', updated_at = NOW()
    WHERE id = v_message.id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.can_send_message(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_or_create_direct_conversation(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_conversation_read(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.send_scheduled_message(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.process_due_scheduled_messages() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_offline_messages_delivered(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_old_typing_indicators()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_message_write_rules() FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.add_conversation_participant(UUID, UUID);

ALTER FUNCTION public.is_conversation_participant(UUID) SET search_path = public;
ALTER FUNCTION public.are_friends(UUID, UUID) SET search_path = public;
ALTER FUNCTION public.set_user_online() SET search_path = public;
ALTER FUNCTION public.set_user_offline() SET search_path = public;
ALTER FUNCTION public.set_user_away() SET search_path = public;
ALTER FUNCTION public.set_user_busy() SET search_path = public;
ALTER FUNCTION public.handle_user_disconnect() SET search_path = public;
ALTER FUNCTION public.search_messages(
  UUID, TEXT, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT
) SET search_path = public;

REVOKE ALL ON FUNCTION public.is_conversation_participant(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.are_friends(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_user_online() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_user_offline() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_user_away() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_user_busy() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_user_disconnect() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_messages(
  UUID, TEXT, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.can_send_message(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_direct_conversation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_scheduled_message(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.are_friends(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_online() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_offline() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_away() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_busy() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_user_disconnect() TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_messages(
  UUID, TEXT, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_due_scheduled_messages() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_typing_indicators() TO service_role;
