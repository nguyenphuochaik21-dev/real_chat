-- Friend requests and accepted friendships.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'friendship_status') THEN
    CREATE TYPE public.friendship_status AS ENUM ('pending', 'accepted', 'declined');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.friendship_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  CONSTRAINT friendships_different_users CHECK (requester_id <> addressee_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS friendships_unique_pair
  ON public.friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX IF NOT EXISTS friendships_requester_idx ON public.friendships(requester_id, status);
CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON public.friendships(addressee_id, status);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS friendships_select_participant ON public.friendships;
CREATE POLICY friendships_select_participant
  ON public.friendships FOR SELECT
  TO authenticated
  USING (requester_id = auth.uid() OR addressee_id = auth.uid());

CREATE OR REPLACE FUNCTION public.send_friend_request(p_addressee_id UUID)
RETURNS public.friendships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_friendship public.friendships%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_addressee_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot send a friend request to yourself';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_addressee_id) THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_blocks
    WHERE (blocker_id = auth.uid() AND blocked_id = p_addressee_id)
       OR (blocker_id = p_addressee_id AND blocked_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Friend request is not available for this user';
  END IF;

  SELECT *
  INTO v_friendship
  FROM public.friendships
  WHERE LEAST(requester_id, addressee_id) = LEAST(auth.uid(), p_addressee_id)
    AND GREATEST(requester_id, addressee_id) = GREATEST(auth.uid(), p_addressee_id)
  FOR UPDATE;

  IF v_friendship.id IS NOT NULL THEN
    IF v_friendship.status = 'accepted' THEN
      RETURN v_friendship;
    END IF;

    IF v_friendship.status = 'pending' AND v_friendship.addressee_id = auth.uid() THEN
      UPDATE public.friendships
      SET status = 'accepted', responded_at = NOW(), updated_at = NOW()
      WHERE id = v_friendship.id
      RETURNING * INTO v_friendship;
      RETURN v_friendship;
    END IF;

    IF v_friendship.status = 'pending' THEN
      RAISE EXCEPTION 'Friend request already sent';
    END IF;

    UPDATE public.friendships
    SET requester_id = auth.uid(),
        addressee_id = p_addressee_id,
        status = 'pending',
        responded_at = NULL,
        updated_at = NOW()
    WHERE id = v_friendship.id
    RETURNING * INTO v_friendship;
    RETURN v_friendship;
  END IF;

  INSERT INTO public.friendships (requester_id, addressee_id)
  VALUES (auth.uid(), p_addressee_id)
  RETURNING * INTO v_friendship;

  RETURN v_friendship;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_friend_request(
  p_friendship_id UUID,
  p_accept BOOLEAN
)
RETURNS public.friendships
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_friendship public.friendships%ROWTYPE;
BEGIN
  UPDATE public.friendships
  SET status = CASE WHEN p_accept THEN 'accepted'::public.friendship_status
                    ELSE 'declined'::public.friendship_status END,
      responded_at = NOW(),
      updated_at = NOW()
  WHERE id = p_friendship_id
    AND addressee_id = auth.uid()
    AND status = 'pending'
  RETURNING * INTO v_friendship;

  IF v_friendship.id IS NULL THEN
    RAISE EXCEPTION 'Pending friend request not found';
  END IF;

  RETURN v_friendship;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_friendship(p_friendship_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.friendships
  WHERE id = p_friendship_id
    AND (requester_id = auth.uid() OR addressee_id = auth.uid());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Friendship not found';
  END IF;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.send_friend_request(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.respond_friend_request(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_friendship(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_friend_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_friend_request(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_friendship(UUID) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'friendships'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
  END IF;
END$$;
