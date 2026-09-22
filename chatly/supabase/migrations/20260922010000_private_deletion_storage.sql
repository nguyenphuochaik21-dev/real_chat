-- Clearing a direct chat belongs to one participant; shared history remains for others.
ALTER TABLE public.conversation_participants
  ADD COLUMN cleared_at TIMESTAMPTZ,
  ADD COLUMN hidden_at TIMESTAMPTZ;

CREATE POLICY messages_after_personal_clear ON public.messages AS RESTRICTIVE
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.conversation_participants p
      WHERE p.conversation_id = messages.conversation_id AND p.user_id = auth.uid()
        AND (p.cleared_at IS NULL OR messages.created_at > p.cleared_at))
  );

-- Preserve the existing security checks, allowing only the FK's SET NULL on a deleted reply.
DO $$
DECLARE definition TEXT;
BEGIN
  definition := pg_get_functiondef('public.enforce_message_write_rules()'::regprocedure);
  IF position('OR NEW.reply_to IS DISTINCT FROM OLD.reply_to' IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected message guard definition';
  END IF;
  EXECUTE replace(definition, 'OR NEW.reply_to IS DISTINCT FROM OLD.reply_to',
    'OR (NEW.reply_to IS DISTINCT FROM OLD.reply_to AND NOT (NEW.reply_to IS NULL AND NOT EXISTS (SELECT 1 FROM public.messages WHERE id = OLD.reply_to)))');

  definition := pg_get_functiondef('public.get_or_create_direct_conversation(uuid)'::regprocedure);
  IF position('IF v_conversation_id IS NOT NULL THEN' IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected direct conversation definition';
  END IF;
  EXECUTE replace(definition, 'IF v_conversation_id IS NOT NULL THEN',
    'IF v_conversation_id IS NOT NULL THEN
      UPDATE public.conversation_participants SET hidden_at = NULL
      WHERE conversation_id = v_conversation_id AND user_id = auth.uid();');

  definition := pg_get_functiondef('public.get_conversation_summaries()'::regprocedure);
  IF position('WHERE message.conversation_id = conversation.id' IN definition) = 0
     OR position('WHERE mine.user_id = (SELECT auth.uid())' IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected conversation summary definition';
  END IF;
  definition := replace(definition, 'WHERE message.conversation_id = conversation.id',
    'WHERE message.conversation_id = conversation.id
       AND (mine.cleared_at IS NULL OR message.created_at > mine.cleared_at)');
  definition := replace(definition, 'WHERE unread.conversation_id = conversation.id',
    'WHERE unread.conversation_id = conversation.id
       AND (mine.cleared_at IS NULL OR unread.created_at > mine.cleared_at)');
  EXECUTE replace(definition, 'WHERE mine.user_id = (SELECT auth.uid())',
    'WHERE mine.user_id = (SELECT auth.uid()) AND mine.hidden_at IS NULL');
END $$;

CREATE OR REPLACE FUNCTION public.delete_conversation_permanently(p_conversation_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE conversation_type TEXT;
BEGIN
  SELECT type INTO conversation_type FROM public.conversations
    WHERE id = p_conversation_id FOR UPDATE;
  IF NOT public.is_conversation_participant(p_conversation_id) THEN
    RAISE EXCEPTION 'Conversation unavailable';
  END IF;
  IF conversation_type = 'group' THEN
    IF NOT public.is_group_owner(p_conversation_id) THEN
      RAISE EXCEPTION 'Only the group owner can permanently delete this conversation';
    END IF;
    DELETE FROM public.call_history WHERE conversation_id = p_conversation_id;
    DELETE FROM public.conversations WHERE id = p_conversation_id;
  ELSE
    UPDATE public.conversation_participants
      SET cleared_at = clock_timestamp(), hidden_at = clock_timestamp(),
          last_read_at = clock_timestamp(), is_pinned = FALSE
      WHERE conversation_id = p_conversation_id AND user_id = auth.uid();
    -- Physically reclaim only history that nobody in this chat retains.
    DELETE FROM public.messages m WHERE m.conversation_id = p_conversation_id
      AND NOT EXISTS (SELECT 1 FROM public.conversation_participants p
        WHERE p.conversation_id = m.conversation_id
          AND (p.cleared_at IS NULL OR p.cleared_at < m.created_at));
  END IF;
  RETURN TRUE;
END $$;

CREATE FUNCTION public.reopen_chat_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Serialize against clear operations before deciding the new message's timestamp.
  PERFORM 1 FROM public.conversations WHERE id = NEW.conversation_id FOR UPDATE;
  NEW.created_at := clock_timestamp();
  UPDATE public.conversation_participants SET hidden_at = NULL
    WHERE conversation_id = NEW.conversation_id AND hidden_at IS NOT NULL;
  RETURN NEW;
END $$;
CREATE TRIGGER reopen_chat_on_message BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.reopen_chat_on_message();
REVOKE ALL ON FUNCTION public.reopen_chat_on_message() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.delete_own_message(p_message_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target public.messages%ROWTYPE;
BEGIN
  SELECT * INTO target FROM public.messages WHERE id = p_message_id;
  IF auth.uid() IS NULL OR target.sender_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Message unavailable';
  END IF;
  DELETE FROM public.messages WHERE id = p_message_id;
  UPDATE public.conversations SET last_message_at = (
    SELECT MAX(created_at) FROM public.messages WHERE conversation_id = target.conversation_id
  ), updated_at = clock_timestamp() WHERE id = target.conversation_id;
  RETURN TRUE;
END $$;
REVOKE ALL ON FUNCTION public.delete_own_message(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_own_message(UUID) TO authenticated;

ALTER TABLE public.storage_cleanup_queue ADD COLUMN requested_by UUID DEFAULT auth.uid();

CREATE FUNCTION public.storage_path_matches(value TEXT, path TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT COALESCE(value = path OR right(split_part(value, '?', 1), length(path) + 1) = '/' || path, FALSE);
$$;

CREATE FUNCTION public.storage_object_referenced(bucket TEXT, path TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN bucket = 'chat-media' THEN
    EXISTS (SELECT 1 FROM public.messages WHERE
      public.storage_path_matches(media_url, path) OR public.storage_path_matches(media_thumbnail_url, path))
    OR EXISTS (SELECT 1 FROM public.scheduled_messages WHERE
      public.storage_path_matches(media_url, path) OR public.storage_path_matches(media_thumbnail_url, path))
  ELSE
    EXISTS (SELECT 1 FROM public.profiles WHERE public.storage_path_matches(avatar_url, path))
    OR EXISTS (SELECT 1 FROM public.conversations WHERE public.storage_path_matches(avatar_url, path))
  END;
$$;
REVOKE ALL ON FUNCTION public.storage_object_referenced(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cleanup_deleted_message_media()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
BEGIN
  INSERT INTO public.storage_cleanup_queue(object_id, bucket_id, object_name)
  SELECT o.id, o.bucket_id, o.name FROM storage.objects o
  WHERE o.bucket_id = 'chat-media'
    AND (public.storage_path_matches(OLD.media_url, o.name)
      OR public.storage_path_matches(OLD.media_thumbnail_url, o.name))
    AND NOT public.storage_object_referenced(o.bucket_id, o.name)
  ON CONFLICT (object_id) DO UPDATE SET requested_by = auth.uid(), queued_at = now();
  RETURN OLD;
END $$;

CREATE TRIGGER scheduled_media_cleanup AFTER DELETE ON public.scheduled_messages
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_deleted_message_media();

CREATE FUNCTION public.reject_retired_media()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.storage_cleanup_queue q WHERE q.bucket_id = 'chat-media'
    AND (public.storage_path_matches(NEW.media_url, q.object_name)
      OR public.storage_path_matches(NEW.media_thumbnail_url, q.object_name))) THEN
    RAISE EXCEPTION 'Attachment is no longer available';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reject_retired_media BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.reject_retired_media();
CREATE TRIGGER reject_retired_scheduled_media BEFORE INSERT OR UPDATE OF media_url, media_thumbnail_url ON public.scheduled_messages
  FOR EACH ROW EXECUTE FUNCTION public.reject_retired_media();
REVOKE ALL ON FUNCTION public.reject_retired_media() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.queue_replaced_avatar()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
BEGIN
  IF OLD.avatar_url IS DISTINCT FROM NEW.avatar_url THEN
    INSERT INTO public.storage_cleanup_queue(object_id, bucket_id, object_name)
    SELECT id, bucket_id, name FROM storage.objects
    WHERE bucket_id = 'profile-avatars' AND public.storage_path_matches(OLD.avatar_url, name)
      AND NOT public.storage_object_referenced(bucket_id, name)
    ON CONFLICT (object_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER queue_replaced_avatar AFTER UPDATE OF avatar_url ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.queue_replaced_avatar();
CREATE TRIGGER queue_replaced_group_avatar AFTER UPDATE OF avatar_url ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.queue_replaced_avatar();
REVOKE ALL ON FUNCTION public.queue_replaced_avatar() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.can_remove_storage_object(bucket TEXT, path TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND bucket IN ('chat-media', 'profile-avatars')
    AND NOT public.storage_object_referenced(bucket, path)
    AND (split_part(path, '/', 1) = auth.uid()::TEXT
      OR EXISTS (SELECT 1 FROM public.storage_cleanup_queue q
        WHERE q.bucket_id = bucket AND q.object_name = path AND q.requested_by = auth.uid()));
$$;
REVOKE ALL ON FUNCTION public.can_remove_storage_object(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_remove_storage_object(TEXT, TEXT) TO authenticated;
CREATE POLICY queued_storage_cleanup_read ON storage.objects FOR SELECT TO authenticated
  USING (public.can_remove_storage_object(bucket_id, name));
CREATE POLICY queued_storage_cleanup_delete ON storage.objects FOR DELETE TO authenticated
  USING (public.can_remove_storage_object(bucket_id, name));
CREATE POLICY preserve_referenced_storage ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
  USING (bucket_id NOT IN ('chat-media', 'profile-avatars')
    OR public.can_remove_storage_object(bucket_id, name));

CREATE FUNCTION public.pending_storage_cleanup()
RETURNS TABLE(bucket_id TEXT, object_name TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  DELETE FROM public.storage_cleanup_queue q
    WHERE (q.requested_by = auth.uid() OR split_part(q.object_name, '/', 1) = auth.uid()::TEXT)
      AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.id = q.object_id);
  RETURN QUERY SELECT q.bucket_id, q.object_name FROM public.storage_cleanup_queue q
    JOIN storage.objects o ON o.id = q.object_id AND o.bucket_id = q.bucket_id AND o.name = q.object_name
    WHERE public.can_remove_storage_object(q.bucket_id, q.object_name)
    ORDER BY q.queued_at LIMIT 100;
END $$;
REVOKE ALL ON FUNCTION public.pending_storage_cleanup() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pending_storage_cleanup() TO authenticated;

-- Old soft-deleted content is no longer needed by either participant.
DELETE FROM public.messages WHERE deleted_at IS NOT NULL;
NOTIFY pgrst, 'reload schema';
