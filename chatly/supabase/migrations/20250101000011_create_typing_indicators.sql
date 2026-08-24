-- Migration: 20250101000011_create_typing_indicators.sql
-- Description: Create typing_indicators table for tracking who is typing in each conversation

CREATE TABLE IF NOT EXISTS public.typing_indicators (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_typing_indicators_conversation
  ON public.typing_indicators(conversation_id);
CREATE INDEX IF NOT EXISTS idx_typing_indicators_updated
  ON public.typing_indicators(updated_at);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.typing_indicators;

-- RLS policies
ALTER TABLE public.typing_indicators ENABLE ROW LEVEL SECURITY;

-- Users can view typing indicators for conversations they're in
DROP POLICY IF EXISTS "Typing indicators are viewable by participants" ON public.typing_indicators;
CREATE POLICY "Typing indicators are viewable by participants"
  ON public.typing_indicators FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = typing_indicators.conversation_id
        AND user_id = auth.uid()
    )
  );

-- Users can insert/update their own typing indicator
DROP POLICY IF EXISTS "Users can upsert own typing indicator" ON public.typing_indicators;
CREATE POLICY "Users can upsert own typing indicator"
  ON public.typing_indicators FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own typing indicator" ON public.typing_indicators;
CREATE POLICY "Users can update own typing indicator"
  ON public.typing_indicators FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own typing indicator
DROP POLICY IF EXISTS "Users can delete own typing indicator" ON public.typing_indicators;
CREATE POLICY "Users can delete own typing indicator"
  ON public.typing_indicators FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Auto-delete old typing indicators (older than 10 seconds)
-- This is a cleanup function that can be called periodically
CREATE OR REPLACE FUNCTION public.cleanup_old_typing_indicators()
RETURNS void AS $$
BEGIN
  DELETE FROM public.typing_indicators
  WHERE updated_at < NOW() - INTERVAL '10 seconds';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
