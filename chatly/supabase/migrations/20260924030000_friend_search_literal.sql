-- Match punctuation in usernames literally while retaining the profile trigram indexes.
CREATE OR REPLACE FUNCTION public.search_friend_candidates(
  p_query TEXT,
  p_limit INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH input AS (
    SELECT (SELECT auth.uid()) AS user_id,
      LEFT(TRIM(COALESCE(p_query, '')), 50) AS query,
      LEAST(GREATEST(COALESCE(p_limit, 20), 1), 30) AS result_limit
  )
  SELECT COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT(
    'id', result.id,
    'username', result.username,
    'display_name', result.display_name,
    'avatar_url', result.avatar_url,
    'bio', result.bio,
    'status', result.status,
    'last_seen', result.last_seen,
    'created_at', result.created_at,
    'is_verified', result.is_verified
  ) ORDER BY result.display_name, result.id), '[]'::JSONB)
  FROM (
    SELECT profile.*
    FROM input
    JOIN public.profiles AS profile ON profile.id <> input.user_id
    WHERE input.user_id IS NOT NULL
      AND LENGTH(input.query) >= 2
      AND NOT profile.is_suspended
      AND (
        LOWER(profile.display_name) LIKE '%' || REPLACE(REPLACE(REPLACE(LOWER(input.query), '!', '!!'), '%', '!%'), '_', '!_') || '%' ESCAPE '!'
        OR LOWER(profile.username) LIKE '%' || REPLACE(REPLACE(REPLACE(LOWER(input.query), '!', '!!'), '%', '!%'), '_', '!_') || '%' ESCAPE '!'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_blocks AS block
        WHERE (block.blocker_id = input.user_id AND block.blocked_id = profile.id)
           OR (block.blocked_id = input.user_id AND block.blocker_id = profile.id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.friendships AS friendship
        WHERE ((friendship.requester_id = input.user_id AND friendship.addressee_id = profile.id)
           OR (friendship.addressee_id = input.user_id AND friendship.requester_id = profile.id))
          AND friendship.status <> 'declined'
      )
    ORDER BY profile.display_name, profile.id
    LIMIT (SELECT result_limit FROM input)
  ) AS result;
$$;
