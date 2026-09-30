-- Treat user-entered %, _ and backslashes as text, not SQL LIKE patterns.
CREATE OR REPLACE FUNCTION public.admin_list_users_page(
  p_search TEXT DEFAULT '',
  p_offset INTEGER DEFAULT 0,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID, email TEXT, username TEXT, display_name TEXT, avatar_url TEXT,
  role TEXT, is_suspended BOOLEAN, is_verified BOOLEAN, status TEXT,
  last_seen TIMESTAMPTZ, created_at TIMESTAMPTZ, friend_count BIGINT, total_count BIGINT
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
  IF char_length(v_search) > 100 THEN RAISE EXCEPTION 'Search text is too long'; END IF;

  RETURN QUERY
  WITH page AS (
    SELECT profile.id, account.email::TEXT AS email, profile.username, profile.display_name,
      profile.avatar_url, profile.role, profile.is_suspended, profile.is_verified,
      profile.status::TEXT AS status, profile.last_seen, profile.created_at,
      COUNT(*) OVER()::BIGINT AS total_count
    FROM public.profiles profile
    LEFT JOIN auth.users account ON account.id = profile.id
    WHERE v_search = '' OR STRPOS(LOWER(
      COALESCE(profile.display_name, '') || ' ' || COALESCE(profile.username, '') || ' '
      || COALESCE(account.email, '')
    ), v_search) > 0
    ORDER BY profile.created_at DESC, profile.id
    OFFSET v_offset LIMIT v_limit
  )
  SELECT page.id, page.email, page.username, page.display_name, page.avatar_url,
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

REVOKE ALL ON FUNCTION public.admin_list_users_page(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users_page(TEXT, INTEGER, INTEGER) TO authenticated;
