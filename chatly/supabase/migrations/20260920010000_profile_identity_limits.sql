-- Keep new and edited profile identities compact enough for chat and mobile layouts.

CREATE OR REPLACE FUNCTION public.enforce_profile_identity_limits()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.display_name IS DISTINCT FROM OLD.display_name THEN
    NEW.display_name := BTRIM(NEW.display_name);
    IF char_length(NEW.display_name) NOT BETWEEN 1 AND 25 THEN
      RAISE EXCEPTION 'Display name must contain between 1 and 25 characters';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.username IS DISTINCT FROM OLD.username THEN
    NEW.username := LOWER(BTRIM(NEW.username));
    IF NEW.username !~ '^[a-z0-9_]{3,25}$' THEN
      RAISE EXCEPTION 'Username must contain 3 to 25 lowercase letters, numbers, or underscores';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_profile_identity_limits_trigger ON public.profiles;
CREATE TRIGGER enforce_profile_identity_limits_trigger
  BEFORE INSERT OR UPDATE OF username, display_name ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_identity_limits();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_username TEXT;
  profile_display_name TEXT;
BEGIN
  profile_username := LOWER(COALESCE(
    NULLIF(BTRIM(NEW.raw_user_meta_data->>'username'), ''),
    'user_' || substr(NEW.id::TEXT, 1, 8)
  ));
  profile_display_name := LEFT(COALESCE(
    NULLIF(BTRIM(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(BTRIM(split_part(COALESCE(NEW.email, ''), '@', 1)), ''),
    'User'
  ), 25);

  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    profile_username,
    profile_display_name,
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_profile_identity_limits() FROM PUBLIC, anon, authenticated;
