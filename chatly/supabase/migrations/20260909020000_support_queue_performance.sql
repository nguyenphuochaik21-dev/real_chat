-- Keep paginated support queues fast and make timestamps consistent at database level.

CREATE INDEX IF NOT EXISTS support_requests_created_queue_idx
  ON public.support_requests(created_at DESC, id DESC)
  INCLUDE (status, user_id, assigned_admin_id);

CREATE INDEX IF NOT EXISTS support_requests_assigned_open_idx
  ON public.support_requests(assigned_admin_id, created_at DESC, id DESC)
  WHERE status IN ('open', 'in_progress');

CREATE OR REPLACE FUNCTION public.touch_support_request_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_requests_touch_updated_at ON public.support_requests;
CREATE TRIGGER support_requests_touch_updated_at
  BEFORE UPDATE ON public.support_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_support_request_updated_at();

REVOKE ALL ON FUNCTION public.touch_support_request_updated_at() FROM PUBLIC, anon, authenticated;

