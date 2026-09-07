-- Keep high-volume call, media, and discovery lists on indexed order/filter paths.

CREATE INDEX IF NOT EXISTS call_history_missed_caller_started_idx
  ON public.call_history(caller_id, started_at DESC, id DESC)
  WHERE status = 'missed';

CREATE INDEX IF NOT EXISTS call_history_missed_callee_started_idx
  ON public.call_history(callee_id, started_at DESC, id DESC)
  WHERE status = 'missed';

CREATE INDEX IF NOT EXISTS messages_media_created_at_idx
  ON public.messages(conversation_id, created_at DESC)
  WHERE content_type <> 'text';

CREATE INDEX IF NOT EXISTS profiles_display_name_idx
  ON public.profiles(display_name, id);
