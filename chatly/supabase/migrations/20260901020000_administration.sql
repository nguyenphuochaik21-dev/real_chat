-- Role-based administration, account suspension, and audit history.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_check CHECK (role IN ('user', 'admin'));
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.is_chatly_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = p_user_id
      AND role = 'admin'
      AND is_suspended = FALSE
  );
$$;

CREATE OR REPLACE FUNCTION public.protect_profile_admin_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.is_chatly_admin(auth.uid())
     AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_suspended IS DISTINCT FROM OLD.is_suspended)
  THEN
    RAISE EXCEPTION 'Only an administrator can change account access fields';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_admin_fields_trigger ON public.profiles;
CREATE TRIGGER protect_profile_admin_fields_trigger
  BEFORE UPDATE OF role, is_suspended ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_admin_fields();

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_audit_logs_created_at_idx
  ON public.admin_audit_logs(created_at DESC);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_audit_logs_select_admin ON public.admin_audit_logs;
CREATE POLICY admin_audit_logs_select_admin
  ON public.admin_audit_logs FOR SELECT
  TO authenticated
  USING (public.is_chatly_admin());

CREATE OR REPLACE FUNCTION public.admin_list_users()
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
  friend_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_chatly_admin() THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    u.email::TEXT,
    p.username,
    p.display_name,
    p.avatar_url,
    p.role,
    p.is_suspended,
    p.status,
    p.last_seen,
    p.created_at,
    (
      SELECT COUNT(*)
      FROM public.friendships f
      WHERE f.status = 'accepted'
        AND (f.requester_id = p.id OR f.addressee_id = p.id)
    )::BIGINT
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  ORDER BY p.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_chatly_admin() THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  RETURN jsonb_build_object(
    'users', (SELECT COUNT(*) FROM public.profiles),
    'suspendedUsers', (SELECT COUNT(*) FROM public.profiles WHERE is_suspended),
    'conversations', (SELECT COUNT(*) FROM public.conversations),
    'messages', (SELECT COUNT(*) FROM public.messages),
    'friendships', (SELECT COUNT(*) FROM public.friendships WHERE status = 'accepted'),
    'calls', (SELECT COUNT(*) FROM public.call_history)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_user(
  p_user_id UUID,
  p_role TEXT,
  p_is_suspended BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before JSONB;
BEGIN
  IF NOT public.is_chatly_admin() THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  IF p_role NOT IN ('user', 'admin') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  IF p_user_id = auth.uid() AND (p_role <> 'admin' OR p_is_suspended) THEN
    RAISE EXCEPTION 'You cannot remove or suspend your own administrator access';
  END IF;

  SELECT jsonb_build_object('role', role, 'isSuspended', is_suspended)
  INTO v_before
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_before IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  UPDATE public.profiles
  SET role = p_role,
      is_suspended = p_is_suspended,
      updated_at = NOW()
  WHERE id = p_user_id;

  INSERT INTO public.admin_audit_logs (admin_id, target_user_id, action, details)
  VALUES (
    auth.uid(),
    p_user_id,
    'user_access_updated',
    jsonb_build_object(
      'before', v_before,
      'after', jsonb_build_object('role', p_role, 'isSuspended', p_is_suspended)
    )
  );

  RETURN TRUE;
END;
$$;

-- Run only from the Supabase SQL editor or service-role backend after the Auth user exists.
CREATE OR REPLACE FUNCTION public.bootstrap_chatly_admin(p_email TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'This bootstrap function is restricted to database administrators';
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE LOWER(email) = LOWER(p_email);
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Create the Auth user before bootstrapping administrator access';
  END IF;

  UPDATE public.profiles
  SET role = 'admin', is_suspended = FALSE, updated_at = NOW()
  WHERE id = v_user_id;

  RETURN v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.is_chatly_admin(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_dashboard_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_user(UUID, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bootstrap_chatly_admin(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_chatly_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user(UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_chatly_admin(TEXT) TO service_role;
