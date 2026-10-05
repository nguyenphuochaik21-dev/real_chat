-- Keep pagination deterministic when a batch of messages shares a timestamp.
CREATE OR REPLACE FUNCTION public.search_messages(
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
  id UUID, content TEXT, conversation_id UUID, sender_id UUID,
  created_at TIMESTAMPTZ, content_type public.message_content_type,
  media_url TEXT, media_name TEXT, relevance REAL, conversation_title TEXT
)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Search requires the current user' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT m.id, m.content, m.conversation_id, m.sender_id, m.created_at,
    m.content_type, m.media_url, m.media_name,
    ts_rank(m.search_vector, plainto_tsquery('english', p_query)),
    COALESCE(c.title, p.display_name)
  FROM public.messages m
  JOIN public.conversation_participants cp
    ON cp.conversation_id = m.conversation_id AND cp.user_id = p_user_id
  LEFT JOIN public.conversations c ON c.id = m.conversation_id
  LEFT JOIN public.profiles p ON p.id = (
    SELECT cp2.user_id FROM public.conversation_participants cp2
    WHERE cp2.conversation_id = m.conversation_id AND cp2.user_id <> p_user_id
    ORDER BY cp2.user_id LIMIT 1
  )
  WHERE m.search_vector @@ plainto_tsquery('english', p_query)
    AND m.deleted_at IS NULL
    AND (p_conversation_id IS NULL OR m.conversation_id = p_conversation_id)
    AND (p_sender_id IS NULL OR m.sender_id = p_sender_id)
    AND (p_date_from IS NULL OR m.created_at >= p_date_from)
    AND (p_date_to IS NULL OR m.created_at <= p_date_to)
  ORDER BY m.created_at DESC, m.id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 101)
  OFFSET LEAST(GREATEST(COALESCE(p_offset, 0), 0), 1000000);
END;
$$;

REVOKE ALL ON FUNCTION public.search_messages(UUID, TEXT, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_messages(UUID, TEXT, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT) TO authenticated;

-- Each removed nonunique btree is the leading column of an existing full
-- btree index. Preserve all primary keys, unique constraints and RLS policies.
-- Covered by conversation_label_map_pkey (conversation_id, label_id).
DROP INDEX IF EXISTS public.idx_conversation_label_map_conv;
-- Covered by idx_participants_conv_user (user_id, conversation_id).
DROP INDEX IF EXISTS public.idx_participants_user;
-- Covered by message_reactions_one_per_user (message_id, user_id).
DROP INDEX IF EXISTS public.idx_reactions_message;
-- Covered by starred_messages_message_id_user_id_key (message_id, user_id).
DROP INDEX IF EXISTS public.idx_starred_message;
-- Covered by typing_indicators_pkey (conversation_id, user_id).
DROP INDEX IF EXISTS public.idx_typing_indicators_conversation;
-- Covered by user_blocks_blocker_id_blocked_id_key (blocker_id, blocked_id).
DROP INDEX IF EXISTS public.idx_blocks_blocker;
