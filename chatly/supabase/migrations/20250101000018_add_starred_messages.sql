-- Migration: 20250101000018_add_starred_messages.sql
-- Description: Add starred messages support

-- Create starred_messages table
CREATE TABLE IF NOT EXISTS public.starred_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

-- Index for efficient starred message queries
CREATE INDEX IF NOT EXISTS idx_starred_user ON public.starred_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_starred_message ON public.starred_messages(message_id);

-- RLS Policies
ALTER TABLE public.starred_messages ENABLE ROW LEVEL SECURITY;

-- Users can view their own starred messages
DROP POLICY IF EXISTS "Users can view own starred messages" ON public.starred_messages;
CREATE POLICY "Users can view own starred messages"
  ON public.starred_messages FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can star messages in their conversations
DROP POLICY IF EXISTS "Users can star messages" ON public.starred_messages;
CREATE POLICY "Users can star messages"
  ON public.starred_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversation_participants cp ON m.conversation_id = cp.conversation_id
      WHERE m.id = message_id
      AND cp.user_id = auth.uid()
    )
  );

-- Users can unstar their own starred messages
DROP POLICY IF EXISTS "Users can unstar messages" ON public.starred_messages;
CREATE POLICY "Users can unstar messages"
  ON public.starred_messages FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Enable realtime for starred messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.starred_messages;
