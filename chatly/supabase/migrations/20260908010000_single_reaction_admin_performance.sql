-- Enforce one reaction per user/message and keep administration reads bounded.

DELETE FROM public.message_reactions older
USING public.message_reactions newer
WHERE older.message_id = newer.message_id
  AND older.user_id = newer.user_id
  AND (COALESCE(older.created_at, 'epoch'::TIMESTAMPTZ), older.id)
    < (COALESCE(newer.created_at, 'epoch'::TIMESTAMPTZ), newer.id);

ALTER TABLE public.message_reactions
  DROP CONSTRAINT IF EXISTS message_reactions_message_id_user_id_emoji_key;
ALTER TABLE public.message_reactions
  ADD CONSTRAINT message_reactions_one_per_user UNIQUE (message_id, user_id);

CREATE OR REPLACE FUNCTION public.toggle_message_reaction(p_message_id UUID, p_emoji TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing TEXT;
  v_conversation_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_emoji IS NULL OR char_length(trim(p_emoji)) NOT BETWEEN 1 AND 32 THEN
    RAISE EXCEPTION 'Invalid reaction';
  END IF;

  SELECT conversation_id INTO v_conversation_id
  FROM public.messages WHERE id = p_message_id;
  IF v_conversation_id IS NULL OR NOT public.is_conversation_participant(v_conversation_id) THEN
    RAISE EXCEPTION 'Message not found';
  END IF;

  SELECT emoji INTO v_existing
  FROM public.message_reactions
  WHERE message_id = p_message_id AND user_id = auth.uid()
  FOR UPDATE;

  IF v_existing = trim(p_emoji) THEN
    DELETE FROM public.message_reactions
    WHERE message_id = p_message_id AND user_id = auth.uid();
    RETURN FALSE;
  END IF;

  INSERT INTO public.message_reactions(message_id, user_id, emoji)
  VALUES (p_message_id, auth.uid(), trim(p_emoji))
  ON CONFLICT (message_id, user_id)
  DO UPDATE SET emoji = EXCLUDED.emoji, created_at = NOW();
  RETURN TRUE;
END;
$$;

DROP FUNCTION IF EXISTS public.admin_list_users_page(TEXT, INTEGER, INTEGER);
CREATE FUNCTION public.admin_list_users_page(
  p_search TEXT DEFAULT '',
  p_offset INTEGER DEFAULT 0,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  role TEXT,
  is_suspended BOOLEAN,
  is_verified BOOLEAN,
  status TEXT,
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  friend_count BIGINT,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_search TEXT := LOWER(TRIM(COALESCE(p_search, '')));
  v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
  IF NOT public.is_chatly_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;

  RETURN QUERY
  WITH page AS (
    SELECT
      profile.id,
      account.email::TEXT AS email,
      profile.username,
      profile.display_name,
      profile.avatar_url,
      profile.role,
      profile.is_suspended,
      profile.is_verified,
      profile.status::TEXT AS status,
      profile.last_seen,
      profile.created_at,
      COUNT(*) OVER()::BIGINT AS total_count
    FROM public.profiles profile
    LEFT JOIN auth.users account ON account.id = profile.id
    WHERE v_search = '' OR LOWER(
      COALESCE(profile.display_name, '') || ' ' || COALESCE(profile.username, '') || ' '
      || COALESCE(account.email, '')
    ) LIKE '%' || v_search || '%'
    ORDER BY profile.created_at DESC, profile.id
    OFFSET v_offset LIMIT v_limit
  )
  SELECT
    page.id, page.email, page.username, page.display_name, page.avatar_url,
    page.role, page.is_suspended, page.is_verified, page.status, page.last_seen, page.created_at,
    (
      SELECT COUNT(*)::BIGINT FROM public.friendships friendship
      WHERE friendship.status = 'accepted'
        AND (friendship.requester_id = page.id OR friendship.addressee_id = page.id)
    ) AS friend_count,
    page.total_count
  FROM page
  ORDER BY page.created_at DESC, page.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.estimated_row_count(p_table REGCLASS)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT GREATEST(COALESCE(reltuples, 0), 0)::BIGINT
  FROM pg_class WHERE oid = p_table;
$$;

ANALYZE public.conversations;
ANALYZE public.messages;
ANALYZE public.friendships;
ANALYZE public.call_history;

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_chatly_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  RETURN JSONB_BUILD_OBJECT(
    'users', (SELECT COUNT(*) FROM public.profiles),
    'suspendedUsers', (SELECT COUNT(*) FROM public.profiles WHERE is_suspended),
    'conversations', public.estimated_row_count('public.conversations'::REGCLASS),
    'messages', public.estimated_row_count('public.messages'::REGCLASS),
    'friendships', public.estimated_row_count('public.friendships'::REGCLASS),
    'calls', public.estimated_row_count('public.call_history'::REGCLASS)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_message_reaction(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.estimated_row_count(REGCLASS) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_message_reaction(UUID, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_list_users_page(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users_page(TEXT, INTEGER, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.cleanup_deleted_message_media()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  IF OLD.media_url IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.messages
    WHERE media_url = OLD.media_url OR media_thumbnail_url = OLD.media_url
  ) THEN
    DELETE FROM storage.objects WHERE bucket_id = 'chat-media' AND name = OLD.media_url;
  END IF;
  IF OLD.media_thumbnail_url IS NOT NULL
     AND OLD.media_thumbnail_url IS DISTINCT FROM OLD.media_url
     AND NOT EXISTS (
       SELECT 1 FROM public.messages
       WHERE media_url = OLD.media_thumbnail_url OR media_thumbnail_url = OLD.media_thumbnail_url
     )
  THEN
    DELETE FROM storage.objects
    WHERE bucket_id = 'chat-media' AND name = OLD.media_thumbnail_url;
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_deleted_profile_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  DELETE FROM public.messages WHERE sender_id = OLD.id;
  DELETE FROM public.conversations conversation
  WHERE conversation.type = 'direct'
    AND EXISTS (
      SELECT 1 FROM public.conversation_participants participant
      WHERE participant.conversation_id = conversation.id AND participant.user_id = OLD.id
    );
  DELETE FROM storage.objects
  WHERE (bucket_id = 'profile-avatars' OR bucket_id = 'chat-media')
    AND (storage.foldername(name))[1] = OLD.id::TEXT;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS profiles_cleanup_owned_data ON public.profiles;
CREATE TRIGGER profiles_cleanup_owned_data
  BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_deleted_profile_data();

REVOKE ALL ON FUNCTION public.cleanup_deleted_profile_data() FROM PUBLIC, anon, authenticated;
