CREATE OR REPLACE FUNCTION public.get_friend_suggestions(p_limit INTEGER DEFAULT 8)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH request_context AS (
    SELECT (SELECT auth.uid()) AS user_id,
      LEAST(GREATEST(COALESCE(p_limit, 8), 1), 30) AS result_limit
  ),
  accepted_friends AS (
    SELECT CASE WHEN f.requester_id = c.user_id THEN f.addressee_id ELSE f.requester_id END AS id
    FROM request_context c
    JOIN public.friendships f
      ON (f.requester_id = c.user_id OR f.addressee_id = c.user_id)
    WHERE f.status = 'accepted'
  ),
  candidates AS (
    SELECT profile.*,
      (SELECT COUNT(*)::INTEGER
       FROM accepted_friends mine
       JOIN public.friendships mutual
         ON mutual.status = 'accepted'
        AND ((mutual.requester_id = mine.id AND mutual.addressee_id = profile.id)
          OR (mutual.addressee_id = mine.id AND mutual.requester_id = profile.id))) AS mutual_friends_count,
      (SELECT COUNT(DISTINCT mine.conversation_id)::INTEGER
       FROM public.conversation_participants mine
       JOIN public.conversation_participants candidate
         ON candidate.conversation_id = mine.conversation_id
        AND candidate.user_id = profile.id
       JOIN public.conversations shared
         ON shared.id = mine.conversation_id AND shared.type = 'group'
       WHERE mine.user_id = c.user_id) AS shared_groups_count
    FROM request_context c
    JOIN public.profiles profile ON profile.id <> c.user_id
    WHERE c.user_id IS NOT NULL
      AND NOT profile.is_suspended
      AND NOT EXISTS (
        SELECT 1 FROM public.user_blocks b
        WHERE (b.blocker_id = c.user_id AND b.blocked_id = profile.id)
           OR (b.blocked_id = c.user_id AND b.blocker_id = profile.id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.friendships f
        WHERE ((f.requester_id = c.user_id AND f.addressee_id = profile.id)
            OR (f.addressee_id = c.user_id AND f.requester_id = profile.id))
          AND f.status <> 'declined'
      )
  )
  SELECT COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT(
    'id', ranked.id,
    'username', ranked.username,
    'display_name', ranked.display_name,
    'avatar_url', ranked.avatar_url,
    'bio', ranked.bio,
    'status', ranked.status,
    'last_seen', ranked.last_seen,
    'created_at', ranked.created_at,
    'is_verified', ranked.is_verified,
    'mutual_friends_count', ranked.mutual_friends_count,
    'shared_groups_count', ranked.shared_groups_count
  ) ORDER BY ranked.mutual_friends_count DESC, ranked.shared_groups_count DESC,
    ranked.created_at DESC, ranked.id), '[]'::JSONB)
  FROM (
    SELECT candidates.* FROM candidates
    ORDER BY mutual_friends_count DESC, shared_groups_count DESC, created_at DESC, id
    LIMIT (SELECT result_limit FROM request_context)
  ) ranked;
$$;
REVOKE ALL ON FUNCTION public.get_friend_suggestions(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friend_suggestions(INTEGER) TO authenticated;

DO $$
DECLARE definition TEXT;
BEGIN
  SELECT pg_get_functiondef('public.get_conversation_summaries()'::regprocedure)
  INTO definition;
  IF position('AS ai_agent_name' IN definition) = 0 THEN
    IF position(E'      conversation.created_by,\n' IN definition) = 0 THEN
      RAISE EXCEPTION 'Could not find the conversation summary projection to add AI agent names';
    END IF;
    definition := replace(
      definition,
      E'      conversation.created_by,\n',
      E'      conversation.created_by,\n      conversation.ai_agent_id,\n      (SELECT agent.name FROM public.ai_agents agent WHERE agent.id = conversation.ai_agent_id) AS ai_agent_name,\n'
    );
    EXECUTE definition;
  END IF;
END $$;
