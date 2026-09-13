-- Scheduled messages must not impersonate server-generated call events.
ALTER TABLE public.scheduled_messages
  ADD CONSTRAINT scheduled_messages_no_call_events CHECK (content_type <> 'call');

CREATE INDEX IF NOT EXISTS profiles_discovery_order_idx
  ON public.profiles(display_name, id) WHERE NOT is_suspended;
