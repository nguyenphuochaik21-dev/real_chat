-- Optional friendships, support inbox, shareable groups, verification, and media cleanup.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.profiles SET is_verified = TRUE WHERE role = 'admin';

GRANT SELECT (is_verified) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_admin_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'admin' THEN
    NEW.is_verified := TRUE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_enforce_admin_verification ON public.profiles;
CREATE TRIGGER profiles_enforce_admin_verification
  BEFORE INSERT OR UPDATE OF role, is_verified ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_admin_verification();

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS share_token UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS join_requires_approval BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_share_token_idx
  ON public.conversations(share_token)
  WHERE type = 'group' AND share_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.group_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS group_join_requests_pending_idx
  ON public.group_join_requests(conversation_id, user_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS group_join_requests_moderation_idx
  ON public.group_join_requests(conversation_id, status, created_at, id);
CREATE INDEX IF NOT EXISTS group_join_requests_user_idx
  ON public.group_join_requests(user_id, created_at DESC, id DESC);

ALTER TABLE public.group_join_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.group_join_requests FROM PUBLIC, anon;
GRANT SELECT ON public.group_join_requests TO authenticated;

DROP POLICY IF EXISTS group_join_requests_select ON public.group_join_requests;
CREATE POLICY group_join_requests_select
  ON public.group_join_requests FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_group_admin(conversation_id)
  );

CREATE TABLE IF NOT EXISTS public.support_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (
    category IN ('account', 'messaging', 'calling', 'privacy', 'report', 'other')
  ),
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 5 AND 4000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  admin_response TEXT CHECK (admin_response IS NULL OR char_length(admin_response) <= 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS support_requests_admin_queue_idx
  ON public.support_requests(status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS support_requests_user_history_idx
  ON public.support_requests(user_id, created_at DESC, id DESC);

ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_requests FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.support_requests TO authenticated;

DROP POLICY IF EXISTS support_requests_select ON public.support_requests;
CREATE POLICY support_requests_select
  ON public.support_requests FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_chatly_admin());

DROP POLICY IF EXISTS support_requests_insert ON public.support_requests;
CREATE POLICY support_requests_insert
  ON public.support_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'open'
    AND admin_response IS NULL
    AND resolved_by IS NULL
  );

DROP POLICY IF EXISTS support_requests_update ON public.support_requests;
CREATE POLICY support_requests_update
  ON public.support_requests FOR UPDATE
  TO authenticated
  USING (public.is_chatly_admin())
  WITH CHECK (public.is_chatly_admin());

CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(p_other_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conversation_id UUID;
  v_lock_key TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_other_user_id IS NULL OR p_other_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Select another user';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_other_user_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = auth.uid() AND blocked_id = p_other_user_id)
       OR (blocker_id = p_other_user_id AND blocked_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Conversation is unavailable';
  END IF;

  v_lock_key := LEAST(auth.uid()::TEXT, p_other_user_id::TEXT)
    || ':' || GREATEST(auth.uid()::TEXT, p_other_user_id::TEXT);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));

  SELECT conversation.id INTO v_conversation_id
  FROM public.conversations AS conversation
  JOIN public.conversation_participants AS mine
    ON mine.conversation_id = conversation.id AND mine.user_id = auth.uid()
  JOIN public.conversation_participants AS other
    ON other.conversation_id = conversation.id AND other.user_id = p_other_user_id
  WHERE conversation.type = 'direct'
  ORDER BY conversation.created_at
  LIMIT 1;

  IF v_conversation_id IS NOT NULL THEN
    RETURN v_conversation_id;
  END IF;

  INSERT INTO public.conversations(type, created_by)
  VALUES ('direct', auth.uid())
  RETURNING id INTO v_conversation_id;

  INSERT INTO public.conversation_participants(conversation_id, user_id, role)
  VALUES
    (v_conversation_id, auth.uid(), 'member'),
    (v_conversation_id, p_other_user_id, 'member');

  RETURN v_conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_support_admin_profile()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN NULL ELSE JSONB_BUILD_OBJECT(
    'id', profile.id,
    'username', profile.username,
    'display_name', profile.display_name,
    'avatar_url', profile.avatar_url,
    'is_verified', TRUE
  ) END
  FROM public.profiles AS profile
  WHERE profile.role = 'admin' AND NOT profile.is_suspended
  ORDER BY profile.created_at, profile.id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.set_group_join_approval(
  p_conversation_id UUID,
  p_enabled BOOLEAN
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token UUID;
BEGIN
  IF NOT public.is_group_owner(p_conversation_id) THEN
    RAISE EXCEPTION 'Only the group owner can change join approval';
  END IF;

  UPDATE public.conversations
  SET join_requires_approval = COALESCE(p_enabled, FALSE),
      share_token = COALESCE(share_token, gen_random_uuid()),
      updated_at = NOW()
  WHERE id = p_conversation_id AND type = 'group'
  RETURNING share_token INTO v_token;

  IF v_token IS NULL THEN RAISE EXCEPTION 'Group not found'; END IF;
  RETURN v_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_group_share_info(p_share_token UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN NULL ELSE JSONB_BUILD_OBJECT(
    'id', conversation.id,
    'title', conversation.title,
    'avatar_url', conversation.avatar_url,
    'join_requires_approval', conversation.join_requires_approval,
    'member_count', (
      SELECT COUNT(*) FROM public.conversation_participants member
      WHERE member.conversation_id = conversation.id
    ),
    'is_member', EXISTS (
      SELECT 1 FROM public.conversation_participants member
      WHERE member.conversation_id = conversation.id AND member.user_id = auth.uid()
    ),
    'request_pending', EXISTS (
      SELECT 1 FROM public.group_join_requests request
      WHERE request.conversation_id = conversation.id
        AND request.user_id = auth.uid() AND request.status = 'pending'
    )
  ) END
  FROM public.conversations AS conversation
  WHERE conversation.type = 'group' AND conversation.share_token = p_share_token;
$$;

CREATE OR REPLACE FUNCTION public.join_group_from_share(p_share_token UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group public.conversations%ROWTYPE;
  v_member_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT * INTO v_group
  FROM public.conversations
  WHERE type = 'group' AND share_token = p_share_token
  FOR UPDATE;
  IF v_group.id IS NULL THEN RAISE EXCEPTION 'Group link is invalid'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = v_group.id AND user_id = auth.uid()
  ) THEN RETURN 'joined'; END IF;

  SELECT COUNT(*) INTO v_member_count
  FROM public.conversation_participants
  WHERE conversation_id = v_group.id;
  IF v_member_count >= 100 THEN RAISE EXCEPTION 'Group is full'; END IF;

  IF v_group.join_requires_approval THEN
    INSERT INTO public.group_join_requests(conversation_id, user_id)
    VALUES (v_group.id, auth.uid())
    ON CONFLICT (conversation_id, user_id) WHERE status = 'pending' DO NOTHING;
    RETURN 'pending';
  END IF;

  INSERT INTO public.conversation_participants(conversation_id, user_id, role)
  VALUES (v_group.id, auth.uid(), 'member')
  ON CONFLICT (conversation_id, user_id) DO NOTHING;
  RETURN 'joined';
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_group_join_request(
  p_request_id UUID,
  p_approve BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.group_join_requests%ROWTYPE;
  v_member_count INTEGER;
BEGIN
  SELECT * INTO v_request FROM public.group_join_requests
  WHERE id = p_request_id AND status = 'pending' FOR UPDATE;
  IF v_request.id IS NULL THEN RAISE EXCEPTION 'Join request not found'; END IF;
  IF NOT public.is_group_admin(v_request.conversation_id) THEN
    RAISE EXCEPTION 'Only group administrators can review requests';
  END IF;

  IF p_approve THEN
    SELECT COUNT(*) INTO v_member_count FROM public.conversation_participants
    WHERE conversation_id = v_request.conversation_id;
    IF v_member_count >= 100 THEN RAISE EXCEPTION 'Group is full'; END IF;
    INSERT INTO public.conversation_participants(conversation_id, user_id, role)
    VALUES (v_request.conversation_id, v_request.user_id, 'member')
    ON CONFLICT (conversation_id, user_id) DO NOTHING;
  END IF;

  UPDATE public.group_join_requests
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'declined' END,
      resolved_at = NOW(), resolved_by = auth.uid()
  WHERE id = v_request.id;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_verified(
  p_user_id UUID,
  p_verified BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_chatly_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  UPDATE public.profiles
  SET is_verified = CASE WHEN role = 'admin' THEN TRUE ELSE COALESCE(p_verified, FALSE) END,
      updated_at = NOW()
  WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_deleted_message_media()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  IF OLD.media_url IS NOT NULL THEN
    DELETE FROM storage.objects
    WHERE bucket_id = 'chat-media' AND name = OLD.media_url;
  END IF;
  IF OLD.media_thumbnail_url IS NOT NULL AND OLD.media_thumbnail_url IS DISTINCT FROM OLD.media_url THEN
    DELETE FROM storage.objects
    WHERE bucket_id = 'chat-media' AND name = OLD.media_thumbnail_url;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS messages_cleanup_storage ON public.messages;
CREATE TRIGGER messages_cleanup_storage
  AFTER DELETE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_deleted_message_media();

CREATE OR REPLACE FUNCTION public.get_public_profile(p_profile_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN NULL ELSE JSONB_BUILD_OBJECT(
    'id', profile.id,
    'username', profile.username,
    'display_name', profile.display_name,
    'avatar_url', profile.avatar_url,
    'bio', profile.bio,
    'status', profile.status,
    'last_seen', profile.last_seen,
    'created_at', profile.created_at,
    'is_verified', profile.is_verified,
    'phone', CASE WHEN profile.phone_visibility = 'public' THEN profile.phone ELSE NULL END,
    'birth_date', CASE WHEN profile.birth_date_visibility = 'public' THEN profile.birth_date ELSE NULL END,
    'social_links', profile.social_links
  ) END
  FROM public.profiles AS profile
  WHERE profile.id = p_profile_id;
$$;

REVOKE ALL ON FUNCTION public.enforce_admin_verification() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_deleted_message_media() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_support_admin_profile() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_group_join_approval(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_group_share_info(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.join_group_from_share(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_group_join_request(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_user_verified(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_support_admin_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_group_join_approval(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_group_share_info(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_group_from_share(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_group_join_request(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_user_verified(UUID, BOOLEAN) TO authenticated;

