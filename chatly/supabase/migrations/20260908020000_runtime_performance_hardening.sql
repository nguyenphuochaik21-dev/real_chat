-- Keep frequently refreshed counters and administration filters fast as data grows.

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

CREATE INDEX IF NOT EXISTS users_email_search_idx
  ON auth.users USING GIN (LOWER(email) extensions.gin_trgm_ops);

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
  v_total_count BIGINT;
BEGIN
  IF NOT public.is_chatly_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;

  IF v_search = '' THEN
    SELECT COUNT(*)::BIGINT INTO v_total_count FROM public.profiles;

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
        profile.created_at
      FROM public.profiles profile
      LEFT JOIN auth.users account ON account.id = profile.id
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
      v_total_count
    FROM page
    ORDER BY page.created_at DESC, page.id;
    RETURN;
  END IF;

  RETURN QUERY
  WITH matched_ids AS MATERIALIZED (
    SELECT profile.id
    FROM public.profiles profile
    WHERE LOWER(profile.display_name) LIKE '%' || v_search || '%'
       OR LOWER(profile.username) LIKE '%' || v_search || '%'
    UNION
    SELECT account.id
    FROM auth.users account
    WHERE LOWER(COALESCE(account.email, '')) LIKE '%' || v_search || '%'
  ),
  page AS (
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
    FROM matched_ids matched
    JOIN public.profiles profile ON profile.id = matched.id
    LEFT JOIN auth.users account ON account.id = profile.id
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
REVOKE ALL ON FUNCTION public.admin_list_users_page(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users_page(TEXT, INTEGER, INTEGER) TO authenticated;
