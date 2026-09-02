-- Optional profile details, avatar storage, grouped media, and multi-device push subscriptions.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS birth_date_visibility TEXT NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS phone_visibility TEXT NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '[]'::JSONB;

CREATE OR REPLACE FUNCTION public.is_safe_social_links(value JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN JSONB_TYPEOF(value) <> 'array' THEN FALSE
    ELSE JSONB_ARRAY_LENGTH(value) <= 8
      AND NOT EXISTS (
        SELECT 1
        FROM JSONB_ARRAY_ELEMENTS_TEXT(value) AS links(link)
        WHERE link !~* '^https?://[^[:space:]]+$'
          OR CHAR_LENGTH(link) > 500
      )
  END;
$$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_birth_date_visibility_check
  CHECK (birth_date_visibility IN ('public', 'private')) NOT VALID;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_phone_visibility_check
  CHECK (phone_visibility IN ('public', 'private')) NOT VALID;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_birth_date_check
  CHECK (birth_date IS NULL OR birth_date <= CURRENT_DATE) NOT VALID;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_social_links_check
  CHECK (public.is_safe_social_links(social_links)) NOT VALID;

GRANT UPDATE (
  birth_date, birth_date_visibility, phone_visibility, social_links
) ON TABLE public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN NULL
    ELSE TO_JSONB(profile)
  END
  FROM public.profiles AS profile
  WHERE profile.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_public_profile(p_profile_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN NULL
    ELSE JSONB_BUILD_OBJECT(
      'id', profile.id,
      'username', profile.username,
      'display_name', profile.display_name,
      'avatar_url', profile.avatar_url,
      'bio', profile.bio,
      'status', profile.status,
      'last_seen', profile.last_seen,
      'created_at', profile.created_at,
      'phone', CASE WHEN profile.phone_visibility = 'public' THEN profile.phone ELSE NULL END,
      'birth_date', CASE
        WHEN profile.birth_date_visibility = 'public' THEN profile.birth_date
        ELSE NULL
      END,
      'social_links', profile.social_links
    )
  END
  FROM public.profiles AS profile
  WHERE profile.id = p_profile_id;
$$;

REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_public_profile(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_profile(UUID) TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-avatars',
  'profile-avatars',
  TRUE,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS avatars_public_read ON storage.objects;
CREATE POLICY avatars_public_read
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-avatars');

DROP POLICY IF EXISTS avatars_owner_insert ON storage.objects;
CREATE POLICY avatars_owner_insert
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-avatars'
    AND auth.uid()::TEXT = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS avatars_owner_update ON storage.objects;
CREATE POLICY avatars_owner_update
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'profile-avatars'
    AND auth.uid()::TEXT = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'profile-avatars'
    AND auth.uid()::TEXT = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS avatars_owner_delete ON storage.objects;
CREATE POLICY avatars_owner_delete
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile-avatars'
    AND auth.uid()::TEXT = (storage.foldername(name))[1]
  );

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_group_id UUID;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS push_sent_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS messages_media_group_idx
  ON public.messages(media_group_id)
  WHERE media_group_id IS NOT NULL;

ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_user_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_key
  ON public.push_subscriptions(endpoint);

CREATE OR REPLACE FUNCTION public.get_group_avatar_members(p_conversation_ids UUID[])
RETURNS TABLE (
  conversation_id UUID,
  id UUID,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  status TEXT,
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked_members AS (
    SELECT
      member.conversation_id,
      profile.id,
      profile.username,
      profile.display_name,
      profile.avatar_url,
      profile.bio,
      profile.status,
      profile.last_seen,
      profile.created_at,
      ROW_NUMBER() OVER (
        PARTITION BY member.conversation_id
        ORDER BY MD5(member.conversation_id::TEXT || profile.id::TEXT)
      ) AS position
    FROM public.conversation_participants AS mine
    JOIN public.conversations AS conversation
      ON conversation.id = mine.conversation_id
     AND conversation.type = 'group'
    JOIN public.conversation_participants AS member
      ON member.conversation_id = mine.conversation_id
    JOIN public.profiles AS profile ON profile.id = member.user_id
    WHERE mine.user_id = auth.uid()
      AND mine.conversation_id = ANY(COALESCE(p_conversation_ids, ARRAY[]::UUID[]))
  )
  SELECT
    ranked_members.conversation_id,
    ranked_members.id,
    ranked_members.username,
    ranked_members.display_name,
    ranked_members.avatar_url,
    ranked_members.bio,
    ranked_members.status,
    ranked_members.last_seen,
    ranked_members.created_at
  FROM ranked_members
  WHERE ranked_members.position <= 4
  ORDER BY ranked_members.conversation_id, ranked_members.position;
$$;

REVOKE ALL ON FUNCTION public.get_group_avatar_members(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_group_avatar_members(UUID[]) TO authenticated;
