-- Group conversations, member roles, and authorization-safe management RPCs.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'group_member_role') THEN
    CREATE TYPE public.group_member_role AS ENUM ('owner', 'admin', 'member');
  END IF;
END$$;

ALTER TABLE public.conversation_participants
  ADD COLUMN IF NOT EXISTS role public.group_member_role NOT NULL DEFAULT 'member';

UPDATE public.conversation_participants AS participant
SET role = 'owner'
FROM public.conversations AS conversation
WHERE conversation.id = participant.conversation_id
  AND conversation.type = 'group'
  AND conversation.created_by = participant.user_id
  AND participant.role = 'member';

CREATE INDEX IF NOT EXISTS conversation_participants_group_role_idx
  ON public.conversation_participants (conversation_id, role);

CREATE OR REPLACE FUNCTION public.is_group_admin(
  p_conversation_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants AS participant
    JOIN public.conversations AS conversation ON conversation.id = participant.conversation_id
    WHERE participant.conversation_id = p_conversation_id
      AND participant.user_id = p_user_id
      AND participant.role IN ('owner', 'admin')
      AND conversation.type = 'group'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_group_owner(
  p_conversation_id UUID,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversation_participants AS participant
    JOIN public.conversations AS conversation ON conversation.id = participant.conversation_id
    WHERE participant.conversation_id = p_conversation_id
      AND participant.user_id = p_user_id
      AND participant.role = 'owner'
      AND conversation.type = 'group'
  );
$$;

CREATE OR REPLACE FUNCTION public.are_friends(p_first_user_id UUID, p_second_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.friendships
    WHERE status = 'accepted'
      AND LEAST(requester_id, addressee_id) = LEAST(p_first_user_id, p_second_user_id)
      AND GREATEST(requester_id, addressee_id) = GREATEST(p_first_user_id, p_second_user_id)
  );
$$;

DROP POLICY IF EXISTS conversations_update ON public.conversations;
CREATE POLICY conversations_update
  ON public.conversations FOR UPDATE
  TO authenticated
  USING (
    (type = 'direct' AND public.is_conversation_participant(id))
    OR public.is_group_admin(id)
  )
  WITH CHECK (
    (type = 'direct' AND public.is_conversation_participant(id))
    OR (type = 'group' AND public.is_group_admin(id))
  );

DROP POLICY IF EXISTS participants_insert ON public.conversation_participants;
CREATE POLICY participants_insert_direct_creator
  ON public.conversation_participants FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.conversations
      WHERE id = conversation_id
        AND type = 'direct'
        AND created_by = auth.uid()
    )
  );

REVOKE UPDATE ON public.conversation_participants FROM authenticated;
GRANT UPDATE (last_read_at, is_pinned, is_muted, is_archived)
  ON public.conversation_participants TO authenticated;

CREATE OR REPLACE FUNCTION public.create_group_conversation(
  p_title TEXT,
  p_member_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation_id UUID;
  v_member_ids UUID[];
  v_title TEXT := BTRIM(COALESCE(p_title, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF CHAR_LENGTH(v_title) < 2 OR CHAR_LENGTH(v_title) > 80 THEN
    RAISE EXCEPTION 'Group name must contain between 2 and 80 characters';
  END IF;

  SELECT COALESCE(ARRAY_AGG(DISTINCT member_id), ARRAY[]::UUID[])
  INTO v_member_ids
  FROM UNNEST(COALESCE(p_member_ids, ARRAY[]::UUID[])) AS member_id
  WHERE member_id <> auth.uid();

  IF CARDINALITY(v_member_ids) < 2 THEN
    RAISE EXCEPTION 'Select at least two friends for a group';
  END IF;

  IF CARDINALITY(v_member_ids) > 99 THEN
    RAISE EXCEPTION 'A group can contain at most 100 members';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM UNNEST(v_member_ids) AS member_id
    WHERE NOT public.are_friends(auth.uid(), member_id)
  ) THEN
    RAISE EXCEPTION 'Only accepted friends can be added to a group';
  END IF;

  INSERT INTO public.conversations (type, title, created_by)
  VALUES ('group', v_title, auth.uid())
  RETURNING id INTO v_conversation_id;

  INSERT INTO public.conversation_participants (conversation_id, user_id, role)
  VALUES (v_conversation_id, auth.uid(), 'owner');

  INSERT INTO public.conversation_participants (conversation_id, user_id, role)
  SELECT v_conversation_id, member_id, 'member'
  FROM UNNEST(v_member_ids) AS member_id;

  RETURN v_conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.invite_group_members(
  p_conversation_id UUID,
  p_user_ids UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_ids UUID[];
  v_existing_count INTEGER;
  v_new_count INTEGER;
  v_added_count INTEGER;
BEGIN
  IF NOT public.is_group_admin(p_conversation_id) THEN
    RAISE EXCEPTION 'Only group owners and admins can invite members';
  END IF;

  SELECT COALESCE(ARRAY_AGG(DISTINCT user_id), ARRAY[]::UUID[])
  INTO v_user_ids
  FROM UNNEST(COALESCE(p_user_ids, ARRAY[]::UUID[])) AS user_id
  WHERE user_id <> auth.uid();

  IF CARDINALITY(v_user_ids) = 0 THEN
    RETURN 0;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM UNNEST(v_user_ids) AS user_id
    WHERE NOT public.are_friends(auth.uid(), user_id)
  ) THEN
    RAISE EXCEPTION 'Only accepted friends can be invited';
  END IF;

  SELECT COUNT(*) INTO v_existing_count
  FROM public.conversation_participants
  WHERE conversation_id = p_conversation_id;

  SELECT COUNT(*) INTO v_new_count
  FROM UNNEST(v_user_ids) AS candidate(user_id)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants AS existing
    WHERE existing.conversation_id = p_conversation_id
      AND existing.user_id = candidate.user_id
  );

  IF v_existing_count + v_new_count > 100 THEN
    RAISE EXCEPTION 'A group can contain at most 100 members';
  END IF;

  INSERT INTO public.conversation_participants (conversation_id, user_id, role)
  SELECT p_conversation_id, user_id, 'member'
  FROM UNNEST(v_user_ids) AS user_id
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_added_count = ROW_COUNT;
  IF v_added_count > 0 THEN
    UPDATE public.conversations SET updated_at = NOW() WHERE id = p_conversation_id;
  END IF;
  RETURN v_added_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_group_details(
  p_conversation_id UUID,
  p_title TEXT,
  p_avatar_url TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title TEXT := BTRIM(COALESCE(p_title, ''));
BEGIN
  IF NOT public.is_group_admin(p_conversation_id) THEN
    RAISE EXCEPTION 'Only group owners and admins can update group details';
  END IF;

  IF CHAR_LENGTH(v_title) < 2 OR CHAR_LENGTH(v_title) > 80 THEN
    RAISE EXCEPTION 'Group name must contain between 2 and 80 characters';
  END IF;

  UPDATE public.conversations
  SET title = v_title,
      avatar_url = NULLIF(BTRIM(p_avatar_url), ''),
      updated_at = NOW()
  WHERE id = p_conversation_id
    AND type = 'group';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

  UPDATE public.conversations SET updated_at = NOW() WHERE id = p_conversation_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_group_member_role(
  p_conversation_id UUID,
  p_user_id UUID,
  p_role public.group_member_role
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_group_owner(p_conversation_id) THEN
    RAISE EXCEPTION 'Only the group owner can change member roles';
  END IF;

  IF p_role = 'owner' THEN
    RAISE EXCEPTION 'Use ownership transfer when leaving the group';
  END IF;

  UPDATE public.conversation_participants
  SET role = p_role
  WHERE conversation_id = p_conversation_id
    AND user_id = p_user_id
    AND role <> 'owner';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group member not found or role cannot be changed';
  END IF;

  UPDATE public.conversations SET updated_at = NOW() WHERE id = p_conversation_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_group_member(
  p_conversation_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role public.group_member_role;
  v_target_role public.group_member_role;
BEGIN
  SELECT role INTO v_actor_role
  FROM public.conversation_participants
  WHERE conversation_id = p_conversation_id AND user_id = auth.uid();

  SELECT role INTO v_target_role
  FROM public.conversation_participants
  WHERE conversation_id = p_conversation_id AND user_id = p_user_id;

  IF v_actor_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only group owners and admins can remove members';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Use leave group to remove yourself';
  END IF;

  IF v_target_role IS NULL OR v_target_role = 'owner' THEN
    RAISE EXCEPTION 'This member cannot be removed';
  END IF;

  IF v_actor_role = 'admin' AND v_target_role <> 'member' THEN
    RAISE EXCEPTION 'Admins can only remove regular members';
  END IF;

  DELETE FROM public.conversation_participants
  WHERE conversation_id = p_conversation_id AND user_id = p_user_id;

  UPDATE public.conversations SET updated_at = NOW() WHERE id = p_conversation_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_group(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.group_member_role;
  v_successor_id UUID;
BEGIN
  PERFORM 1
  FROM public.conversations
  WHERE id = p_conversation_id AND type = 'group'
  FOR UPDATE;

  SELECT role INTO v_role
  FROM public.conversation_participants
  WHERE conversation_id = p_conversation_id AND user_id = auth.uid();

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this group';
  END IF;

  IF v_role = 'owner' THEN
    SELECT user_id INTO v_successor_id
    FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id
      AND user_id <> auth.uid()
    ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, joined_at, user_id
    LIMIT 1;

    IF v_successor_id IS NULL THEN
      DELETE FROM public.call_history WHERE conversation_id = p_conversation_id;
      DELETE FROM public.conversations WHERE id = p_conversation_id;
      RETURN TRUE;
    END IF;

    UPDATE public.conversation_participants
    SET role = 'owner'
    WHERE conversation_id = p_conversation_id AND user_id = v_successor_id;

    UPDATE public.conversations
    SET created_by = v_successor_id, updated_at = NOW()
    WHERE id = p_conversation_id;
  END IF;

  DELETE FROM public.conversation_participants
  WHERE conversation_id = p_conversation_id AND user_id = auth.uid();

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_conversation_permanently(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation public.conversations%ROWTYPE;
BEGIN
  SELECT * INTO v_conversation
  FROM public.conversations
  WHERE id = p_conversation_id
  FOR UPDATE;

  IF v_conversation.id IS NULL THEN
    RAISE EXCEPTION 'Conversation not found';
  END IF;

  IF v_conversation.type = 'group' THEN
    IF NOT public.is_group_owner(p_conversation_id) THEN
      RAISE EXCEPTION 'Only the group owner can permanently delete this conversation';
    END IF;
  ELSIF NOT public.is_conversation_participant(p_conversation_id) THEN
    RAISE EXCEPTION 'Not authorized to delete this conversation';
  END IF;

  DELETE FROM public.call_history WHERE conversation_id = p_conversation_id;
  DELETE FROM public.conversations WHERE id = p_conversation_id;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_conversation_summaries()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(JSONB_AGG(summary ORDER BY is_pinned DESC, activity_at DESC), '[]'::JSONB)
  FROM (
    SELECT
      conversation.id,
      conversation.type,
      conversation.title,
      conversation.avatar_url,
      conversation.created_by,
      conversation.last_message_at,
      conversation.created_at,
      conversation.updated_at,
      mine.is_pinned,
      mine.is_muted,
      mine.is_archived,
      GREATEST(
        COALESCE(last_message.created_at, '-infinity'::TIMESTAMPTZ),
        COALESCE(conversation.last_message_at, '-infinity'::TIMESTAMPTZ)
      ) AS activity_at,
      COALESCE(member_totals.member_count, 0) AS member_count,
      CASE
        WHEN conversation.type = 'direct' THEN TO_JSONB(other_profile)
        ELSE NULL
      END AS participant,
      CASE
        WHEN last_message.id IS NULL THEN NULL
        ELSE TO_JSONB(last_message)
      END AS last_message,
      (
        SELECT COUNT(*)
        FROM public.messages AS unread
        WHERE unread.conversation_id = conversation.id
          AND unread.sender_id IS DISTINCT FROM auth.uid()
          AND unread.created_at > COALESCE(mine.last_read_at, 'epoch'::TIMESTAMPTZ)
      ) AS unread_count
    FROM public.conversation_participants AS mine
    JOIN public.conversations AS conversation ON conversation.id = mine.conversation_id
    LEFT JOIN LATERAL (
      SELECT message.*
      FROM public.messages AS message
      WHERE message.conversation_id = conversation.id
      ORDER BY message.created_at DESC
      LIMIT 1
    ) AS last_message ON TRUE
    LEFT JOIN LATERAL (
      SELECT profile.*
      FROM public.conversation_participants AS other
      JOIN public.profiles AS profile ON profile.id = other.user_id
      WHERE other.conversation_id = conversation.id
        AND other.user_id <> auth.uid()
      ORDER BY other.joined_at
      LIMIT 1
    ) AS other_profile ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::INTEGER AS member_count
      FROM public.conversation_participants AS member
      WHERE member.conversation_id = conversation.id
    ) AS member_totals ON TRUE
    WHERE mine.user_id = auth.uid()
  ) AS summary;
$$;

REVOKE ALL ON FUNCTION public.is_group_admin(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_group_owner(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.are_friends(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_group_conversation(TEXT, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invite_group_members(UUID, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_group_details(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_group_member_role(UUID, UUID, public.group_member_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_group_member(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leave_group(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_conversation_summaries() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_group_admin(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_owner(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_group_conversation(TEXT, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_group_members(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_group_details(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_group_member_role(UUID, UUID, public.group_member_role)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_group_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_group(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_conversation_summaries() TO authenticated;
