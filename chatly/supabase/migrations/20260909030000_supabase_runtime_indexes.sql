-- Apply public-schema runtime indexes without requiring ownership of Supabase's auth tables.

CREATE INDEX IF NOT EXISTS messages_unread_lookup_idx
  ON public.messages(conversation_id, created_at)
  INCLUDE (sender_id);

CREATE INDEX IF NOT EXISTS conversation_participants_unread_lookup_idx
  ON public.conversation_participants(user_id, is_archived, conversation_id)
  INCLUDE (last_read_at);

CREATE INDEX IF NOT EXISTS profiles_suspended_users_idx
  ON public.profiles(id)
  WHERE is_suspended = TRUE;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS profiles_display_name_search_idx
  ON public.profiles USING GIN (LOWER(display_name) extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS profiles_username_search_idx
  ON public.profiles USING GIN (LOWER(username) extensions.gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.get_unread_message_count()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(
    (
      SELECT COUNT(*)
      FROM public.messages message
      WHERE message.conversation_id = participant.conversation_id
        AND message.sender_id IS DISTINCT FROM auth.uid()
        AND message.created_at > COALESCE(participant.last_read_at, 'epoch'::TIMESTAMPTZ)
    )
  ), 0)::BIGINT
  FROM public.conversation_participants participant
  WHERE participant.user_id = auth.uid()
    AND COALESCE(participant.is_archived, FALSE) = FALSE;
$$;

REVOKE ALL ON FUNCTION public.get_unread_message_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_unread_message_count() TO authenticated;

