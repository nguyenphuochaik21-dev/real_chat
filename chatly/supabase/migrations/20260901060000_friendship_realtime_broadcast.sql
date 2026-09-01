-- Deliver friendship changes reliably to both participants through private Realtime broadcasts.

ALTER TABLE public.friendships REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS friendship_broadcast_select ON realtime.messages;
CREATE POLICY friendship_broadcast_select
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (realtime.topic() = 'friendships:' || auth.uid()::TEXT);

CREATE OR REPLACE FUNCTION public.broadcast_friendship_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_requester_id UUID;
  v_addressee_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_requester_id := OLD.requester_id;
    v_addressee_id := OLD.addressee_id;
  ELSE
    v_requester_id := NEW.requester_id;
    v_addressee_id := NEW.addressee_id;
  END IF;

  PERFORM realtime.broadcast_changes(
    'friendships:' || v_requester_id::TEXT,
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    NEW,
    OLD
  );

  PERFORM realtime.broadcast_changes(
    'friendships:' || v_addressee_id::TEXT,
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    NEW,
    OLD
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS friendships_broadcast_change ON public.friendships;
CREATE TRIGGER friendships_broadcast_change
  AFTER INSERT OR UPDATE OR DELETE ON public.friendships
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_friendship_change();

REVOKE ALL ON FUNCTION public.broadcast_friendship_change() FROM PUBLIC, anon, authenticated;
