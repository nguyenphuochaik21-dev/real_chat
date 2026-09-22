-- Recover abandoned uploads on the owner's next session without touching active files.
CREATE OR REPLACE FUNCTION public.pending_storage_cleanup()
RETURNS TABLE(bucket_id TEXT, object_name TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  DELETE FROM public.storage_cleanup_queue q
    WHERE (q.requested_by = auth.uid() OR split_part(q.object_name, '/', 1) = auth.uid()::TEXT)
      AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.id = q.object_id);
  INSERT INTO public.storage_cleanup_queue(object_id, bucket_id, object_name)
    SELECT o.id, o.bucket_id, o.name FROM storage.objects o
    WHERE o.bucket_id IN ('chat-media', 'profile-avatars')
      AND o.name LIKE auth.uid()::TEXT || '/%'
      AND o.updated_at < now() - interval '1 day'
      AND NOT public.storage_object_referenced(o.bucket_id, o.name)
    ORDER BY o.updated_at LIMIT 100
    ON CONFLICT (object_id) DO NOTHING;
  RETURN QUERY SELECT q.bucket_id, q.object_name FROM public.storage_cleanup_queue q
    JOIN storage.objects o ON o.id = q.object_id AND o.bucket_id = q.bucket_id AND o.name = q.object_name
    WHERE public.can_remove_storage_object(q.bucket_id, q.object_name)
    ORDER BY q.queued_at LIMIT 100;
END $$;

CREATE FUNCTION public.cleanup_deleted_group_avatar()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage AS $$
BEGIN
  INSERT INTO public.storage_cleanup_queue(object_id, bucket_id, object_name)
    SELECT o.id, o.bucket_id, o.name FROM storage.objects o
    WHERE o.bucket_id = 'profile-avatars'
      AND public.storage_path_matches(OLD.avatar_url, o.name)
      AND NOT public.storage_object_referenced(o.bucket_id, o.name)
    ON CONFLICT (object_id) DO NOTHING;
  RETURN OLD;
END $$;
CREATE TRIGGER cleanup_deleted_group_avatar AFTER DELETE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_deleted_group_avatar();
REVOKE ALL ON FUNCTION public.cleanup_deleted_group_avatar() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.reject_retired_avatar()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.avatar_url IS DISTINCT FROM OLD.avatar_url AND EXISTS (
    SELECT 1 FROM public.storage_cleanup_queue q WHERE q.bucket_id = 'profile-avatars'
      AND public.storage_path_matches(NEW.avatar_url, q.object_name)
  ) THEN RAISE EXCEPTION 'Avatar is no longer available'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reject_retired_avatar BEFORE UPDATE OF avatar_url ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.reject_retired_avatar();
CREATE TRIGGER reject_retired_group_avatar BEFORE UPDATE OF avatar_url ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.reject_retired_avatar();
REVOKE ALL ON FUNCTION public.reject_retired_avatar() FROM PUBLIC, anon, authenticated;

-- Lock in the same order as inserts/clears to avoid reply/delete deadlocks.
CREATE OR REPLACE FUNCTION public.delete_own_message(p_message_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target public.messages%ROWTYPE;
BEGIN
  SELECT * INTO target FROM public.messages WHERE id = p_message_id;
  IF auth.uid() IS NULL OR target.sender_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Message unavailable';
  END IF;
  PERFORM 1 FROM public.conversations WHERE id = target.conversation_id FOR UPDATE;
  DELETE FROM public.messages WHERE id = p_message_id AND sender_id = auth.uid();
  UPDATE public.conversations SET last_message_at = (
    SELECT MAX(created_at) FROM public.messages WHERE conversation_id = target.conversation_id
  ), updated_at = clock_timestamp() WHERE id = target.conversation_id;
  RETURN TRUE;
END $$;
NOTIFY pgrst, 'reload schema';
