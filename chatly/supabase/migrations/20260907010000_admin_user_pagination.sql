-- Keep the administration user directory bounded as the account table grows.

CREATE INDEX IF NOT EXISTS profiles_created_at_desc_idx
  ON public.profiles(created_at DESC);

CREATE OR REPLACE FUNCTION public.admin_list_users_page(
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
  IF NOT public.is_chatly_admin() THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  RETURN QUERY
  WITH friendship_sides AS (
    SELECT requester_id AS user_id
    FROM public.friendships
    WHERE friendships.status = 'accepted'
    UNION ALL
    SELECT addressee_id AS user_id
    FROM public.friendships
    WHERE friendships.status = 'accepted'
  ),
  friend_counts AS (
    SELECT user_id, COUNT(*)::BIGINT AS friend_count
    FROM friendship_sides
    GROUP BY user_id
  ),
  filtered AS (
    SELECT
      p.id,
      u.email::TEXT AS email,
      p.username,
      p.display_name,
      p.avatar_url,
      p.role,
      p.is_suspended,
      p.status,
      p.last_seen,
      p.created_at,
      COALESCE(fc.friend_count, 0)::BIGINT AS friend_count
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    LEFT JOIN friend_counts fc ON fc.user_id = p.id
    WHERE v_search = ''
      OR LOWER(COALESCE(p.display_name, '') || ' ' || COALESCE(p.username, '') || ' ' || COALESCE(u.email, ''))
        LIKE '%' || v_search || '%'
  )
  SELECT
    filtered.id,
    filtered.email,
    filtered.username,
    filtered.display_name,
    filtered.avatar_url,
    filtered.role,
    filtered.is_suspended,
    filtered.status,
    filtered.last_seen,
    filtered.created_at,
    filtered.friend_count,
    COUNT(*) OVER()::BIGINT AS total_count
  FROM filtered
  ORDER BY filtered.created_at DESC, filtered.id
  OFFSET v_offset
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users_page(TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_users_page(TEXT, INTEGER, INTEGER) TO authenticated;
