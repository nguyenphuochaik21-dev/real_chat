-- Additive support for structured n8n output on the existing multi-agent feature.
ALTER TABLE public.ai_turns
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS reply_attachments JSONB NOT NULL DEFAULT '[]'::JSONB;

ALTER TABLE public.ai_turns
  DROP CONSTRAINT IF EXISTS ai_turns_reply_attachments_array,
  ADD CONSTRAINT ai_turns_reply_attachments_array
    CHECK (jsonb_typeof(reply_attachments) = 'array' AND jsonb_array_length(reply_attachments) <= 12);

NOTIFY pgrst, 'reload schema';
