-- Migration: 20250101000016_add_search_support.sql
-- Description: Add full-text search support for messages

-- Add search vector column for full-text search
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_messages_search_vector
ON public.messages USING GIN(search_vector);

-- Create trigger function to update search_vector
CREATE OR REPLACE FUNCTION update_message_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector(
    'english',
    COALESCE(NEW.content, '') || ' ' || COALESCE(NEW.media_name, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (drop first if exists to avoid duplicates)
DROP TRIGGER IF EXISTS trigger_update_message_search_vector ON public.messages;
CREATE TRIGGER trigger_update_message_search_vector
  BEFORE INSERT OR UPDATE OF content, media_name ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION update_message_search_vector();

-- Update existing messages with search vectors
UPDATE public.messages
SET search_vector = to_tsvector(
  'english',
  COALESCE(content, '') || ' ' || COALESCE(media_name, '')
)
WHERE search_vector IS NULL;

-- Create search function for messages
CREATE OR REPLACE FUNCTION search_messages(
  p_user_id UUID,
  p_query TEXT,
  p_conversation_id UUID DEFAULT NULL,
  p_sender_id UUID DEFAULT NULL,
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  conversation_id UUID,
  sender_id UUID,
  created_at TIMESTAMPTZ,
  content_type message_content_type,
  media_url TEXT,
  media_name TEXT,
  relevance REAL,
  conversation_title TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.content,
    m.conversation_id,
    m.sender_id,
    m.created_at,
    m.content_type,
    m.media_url,
    m.media_name,
    ts_rank(m.search_vector, plainto_tsquery('english', p_query)) AS relevance,
    COALESCE(c.title, p.display_name) AS conversation_title
  FROM public.messages m
  INNER JOIN public.conversation_participants cp
    ON cp.conversation_id = m.conversation_id
    AND cp.user_id = p_user_id
  LEFT JOIN public.conversations c ON c.id = m.conversation_id
  LEFT JOIN public.profiles p ON p.id = (
    SELECT cp2.user_id
    FROM public.conversation_participants cp2
    WHERE cp2.conversation_id = m.conversation_id
    AND cp2.user_id != p_user_id
    LIMIT 1
  )
  WHERE
    m.search_vector @@ plainto_tsquery('english', p_query)
    AND m.deleted_at IS NULL
    AND (p_conversation_id IS NULL OR m.conversation_id = p_conversation_id)
    AND (p_sender_id IS NULL OR m.sender_id = p_sender_id)
    AND (p_date_from IS NULL OR m.created_at >= p_date_from)
    AND (p_date_to IS NULL OR m.created_at <= p_date_to)
  ORDER BY m.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION search_messages TO authenticated;
