-- A request ID belongs to both the user's message and the assistant's reply.
-- Only assistant replies must be unique; the old index also indexed user messages.
CREATE UNIQUE INDEX IF NOT EXISTS chat_assistant_ai_reply_once
  ON public.messages ((metadata->>'ai_request_id'))
  WHERE metadata->>'sender_type' = 'ai' AND metadata ? 'ai_request_id';

DROP INDEX IF EXISTS public.chat_assistant_reply_once;
