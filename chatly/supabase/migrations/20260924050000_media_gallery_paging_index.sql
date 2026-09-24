-- Serve bounded media pages in stable order without indexing deleted messages.
CREATE INDEX IF NOT EXISTS messages_active_media_page_idx
  ON public.messages(conversation_id, created_at DESC, id DESC)
  WHERE content_type IN ('image', 'video', 'audio', 'file')
    AND deleted_at IS NULL
    AND media_url IS NOT NULL;

DROP INDEX IF EXISTS public.messages_media_created_at_idx;
DROP INDEX IF EXISTS public.idx_messages_media;

ANALYZE public.messages;
