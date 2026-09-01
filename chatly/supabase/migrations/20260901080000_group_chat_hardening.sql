-- Close legacy mutation paths and serialize group membership changes.

REVOKE UPDATE ON public.conversations FROM authenticated;
GRANT UPDATE (last_message_at, updated_at) ON public.conversations TO authenticated;

CREATE OR REPLACE FUNCTION public.add_conversation_participant(
  p_conversation_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation_type public.conversation_type;
  v_creator_id UUID;
  v_participant_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT type, created_by
  INTO v_conversation_type, v_creator_id
  FROM public.conversations
  WHERE id = p_conversation_id
  FOR UPDATE;

  IF NOT FOUND OR v_conversation_type <> 'direct' OR v_creator_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the creator can add a participant to a direct conversation';
  END IF;

  IF p_user_id IS NULL OR p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Select another user for the direct conversation';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id
      AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Join the conversation before adding its other participant';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id
      AND user_id = p_user_id
  ) THEN
    RETURN TRUE;
  END IF;

  SELECT COUNT(*) INTO v_participant_count
  FROM public.conversation_participants
  WHERE conversation_id = p_conversation_id;

  IF v_participant_count >= 2 THEN
    RAISE EXCEPTION 'A direct conversation can contain only two participants';
  END IF;

  INSERT INTO public.conversation_participants (conversation_id, user_id, role)
  VALUES (p_conversation_id, p_user_id, 'member');

  RETURN TRUE;
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
  PERFORM 1
  FROM public.conversations
  WHERE id = p_conversation_id
    AND type = 'group'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

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
  WHERE id = p_conversation_id
    AND type = 'group'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

  SELECT role INTO v_role
  FROM public.conversation_participants
  WHERE conversation_id = p_conversation_id
    AND user_id = auth.uid();

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
    WHERE conversation_id = p_conversation_id
      AND user_id = v_successor_id;

    UPDATE public.conversations
    SET created_by = v_successor_id,
        updated_at = NOW()
    WHERE id = p_conversation_id;
  END IF;

  DELETE FROM public.conversation_participants
  WHERE conversation_id = p_conversation_id
    AND user_id = auth.uid();

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.add_conversation_participant(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invite_group_members(UUID, UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leave_group(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.add_conversation_participant(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_group_members(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_group(UUID) TO authenticated;
