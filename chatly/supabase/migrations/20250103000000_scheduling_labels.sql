-- Phase 4.6: Scheduling & Labels
-- Scheduled Messages and Conversation Labels

-- =============================================================================
-- SCHEDULED MESSAGES
-- =============================================================================

CREATE TABLE IF NOT EXISTS scheduled_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  content_type TEXT DEFAULT 'text',
  media_url TEXT,
  media_thumbnail_url TEXT,
  media_name TEXT,
  media_size BIGINT,
  media_mime_type TEXT,
  reply_to UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE scheduled_messages ENABLE ROW LEVEL SECURITY;

-- Users can manage their own scheduled messages
DROP POLICY IF EXISTS "Users manage own scheduled messages" ON scheduled_messages;
CREATE POLICY "Users manage own scheduled messages"
ON scheduled_messages FOR ALL
USING (auth.uid() = sender_id)
WITH CHECK (auth.uid() = sender_id);

-- Index for processing scheduled messages
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_status_scheduled
ON scheduled_messages(status, scheduled_at)
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_sender
ON scheduled_messages(sender_id);

-- =============================================================================
-- CONVERSATION LABELS
-- =============================================================================

CREATE TABLE IF NOT EXISTS conversation_labels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#8B5CF6',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE conversation_labels ENABLE ROW LEVEL SECURITY;

-- Users can manage their own labels
DROP POLICY IF EXISTS "Users manage own labels" ON conversation_labels;
CREATE POLICY "Users manage own labels"
ON conversation_labels FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_conversation_labels_user
ON conversation_labels(user_id);

-- =============================================================================
-- CONVERSATION-LABEL MAPPING
-- =============================================================================

CREATE TABLE IF NOT EXISTS conversation_label_map (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  label_id UUID NOT NULL REFERENCES conversation_labels(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (conversation_id, label_id)
);

-- Enable RLS
ALTER TABLE conversation_label_map ENABLE ROW LEVEL SECURITY;

-- Users can manage labels for their conversations
DROP POLICY IF EXISTS "Users manage labels for their conversations" ON conversation_label_map;
CREATE POLICY "Users manage labels for their conversations"
ON conversation_label_map FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_participants.conversation_id = conversation_label_map.conversation_id
    AND conversation_participants.user_id = auth.uid()
  )
);

CREATE INDEX IF NOT EXISTS idx_conversation_label_map_conv
ON conversation_label_map(conversation_id);

CREATE INDEX IF NOT EXISTS idx_conversation_label_map_label
ON conversation_label_map(label_id);

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to send a scheduled message
CREATE OR REPLACE FUNCTION public.send_scheduled_message(scheduled_message_id UUID)
RETURNS UUID AS $$
DECLARE
  v_message scheduled_messages%ROWTYPE;
  v_sent_message_id UUID;
BEGIN
  -- Get the scheduled message
  SELECT * INTO v_message
  FROM scheduled_messages
  WHERE id = scheduled_message_id AND status = 'pending';

  IF v_message IS NULL THEN
    RAISE EXCEPTION 'Scheduled message not found or already processed';
  END IF;

  -- Insert the actual message
  INSERT INTO public.messages (
    conversation_id,
    sender_id,
    content,
    content_type,
    media_url,
    media_thumbnail_url,
    media_name,
    media_size,
    media_mime_type,
    reply_to,
    status
  ) VALUES (
    v_message.conversation_id,
    v_message.sender_id,
    v_message.content,
    v_message.content_type::message_content_type,
    v_message.media_url,
    v_message.media_thumbnail_url,
    v_message.media_name,
    v_message.media_size,
    v_message.media_mime_type,
    v_message.reply_to,
    'sent'
  ) RETURNING id INTO v_sent_message_id;

  -- Update conversation's last_message_at
  UPDATE public.conversations
  SET last_message_at = NOW()
  WHERE id = v_message.conversation_id;

  -- Mark scheduled message as sent
  UPDATE scheduled_messages
  SET status = 'sent', updated_at = NOW()
  WHERE id = scheduled_message_id;

  RETURN v_sent_message_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.send_scheduled_message TO authenticated;

-- =============================================================================
-- REALTIME FOR SCHEDULED MESSAGES
-- =============================================================================

-- Enable realtime for scheduled_messages (skip if already added)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'scheduled_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE scheduled_messages;
  END IF;
END $$;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE scheduled_messages IS 'Messages scheduled to be sent at a future time';
COMMENT ON TABLE conversation_labels IS 'User-defined labels for organizing conversations';
COMMENT ON TABLE conversation_label_map IS 'Maps conversations to labels';
COMMENT ON FUNCTION send_scheduled_message IS 'Sends a scheduled message immediately and marks it as sent';
