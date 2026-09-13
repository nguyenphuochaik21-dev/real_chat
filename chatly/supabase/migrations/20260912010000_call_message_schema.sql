-- Store call outcomes as structured timeline entries and keep message pagination deterministic.

ALTER TYPE public.message_content_type ADD VALUE IF NOT EXISTS 'call';

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS call_session_id UUID
    REFERENCES public.call_sessions(id) ON DELETE SET NULL;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_metadata_object;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_metadata_object
  CHECK (JSONB_TYPEOF(metadata) = 'object') NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS messages_call_session_unique
  ON public.messages(call_session_id)
  WHERE call_session_id IS NOT NULL;

DROP INDEX IF EXISTS public.idx_messages_conversation;
CREATE INDEX idx_messages_conversation
  ON public.messages(conversation_id, created_at DESC, id DESC);

ALTER TABLE public.call_sessions ADD COLUMN IF NOT EXISTS push_sent_at TIMESTAMPTZ;
