-- Storage objects must be removed through the Storage API, never by deleting its metadata.
CREATE TABLE public.storage_cleanup_queue (
  object_id UUID PRIMARY KEY,
  bucket_id TEXT NOT NULL CHECK (bucket_id IN ('chat-media', 'profile-avatars')),
  object_name TEXT NOT NULL,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.storage_cleanup_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storage_cleanup_queue FROM anon, authenticated;
GRANT ALL ON public.storage_cleanup_queue TO service_role;
CREATE INDEX storage_cleanup_queue_age_idx ON public.storage_cleanup_queue(queued_at);

CREATE OR REPLACE FUNCTION public.cleanup_deleted_message_media()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage
AS $$
BEGIN
  INSERT INTO public.storage_cleanup_queue(object_id, bucket_id, object_name)
  SELECT object.id, object.bucket_id, object.name
  FROM storage.objects object
  WHERE object.bucket_id = 'chat-media'
    AND object.name IN (OLD.media_url, OLD.media_thumbnail_url)
    AND NOT EXISTS (
      SELECT 1 FROM public.messages WHERE media_url = object.name OR media_thumbnail_url = object.name
    )
  ON CONFLICT (object_id) DO NOTHING;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_deleted_profile_data()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage
AS $$
BEGIN
  DELETE FROM public.messages WHERE sender_id = OLD.id;
  DELETE FROM public.conversations conversation
  WHERE conversation.type = 'direct'
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants participant
      WHERE participant.conversation_id = conversation.id AND participant.user_id = OLD.id
    );
  INSERT INTO public.storage_cleanup_queue(object_id, bucket_id, object_name)
  SELECT id, bucket_id, name FROM storage.objects
  WHERE bucket_id IN ('profile-avatars', 'chat-media')
    AND (storage.foldername(name))[1] = OLD.id::TEXT
  ON CONFLICT (object_id) DO NOTHING;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.cleanup_deleted_message_media() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_deleted_profile_data() FROM PUBLIC, anon, authenticated;
