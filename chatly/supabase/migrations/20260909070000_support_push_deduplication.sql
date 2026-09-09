-- Prevent clients from replaying the same support push notification.

ALTER TABLE public.support_requests
  ADD COLUMN IF NOT EXISTS admin_push_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS user_push_sent_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.reset_support_reply_push_marker()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.admin_response IS DISTINCT FROM OLD.admin_response
     OR NEW.status IS DISTINCT FROM OLD.status
  THEN
    NEW.user_push_sent_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_requests_reset_reply_push ON public.support_requests;
CREATE TRIGGER support_requests_reset_reply_push
  BEFORE UPDATE ON public.support_requests
  FOR EACH ROW EXECUTE FUNCTION public.reset_support_reply_push_marker();

REVOKE ALL ON FUNCTION public.reset_support_reply_push_marker()
  FROM PUBLIC, anon, authenticated;

