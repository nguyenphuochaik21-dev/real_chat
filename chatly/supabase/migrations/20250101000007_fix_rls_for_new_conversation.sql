-- Migration: 20250101000007_fix_rls_for_new_conversation.sql
-- Description: Fix RLS to allow adding participants when creating a new conversation

-- Drop and recreate the participants INSERT policy to allow the creator to add other participants
DROP POLICY IF EXISTS "Users can join conversations" ON public.conversation_participants;

-- Allow users to add themselves OR other users when they are creating a new conversation
CREATE POLICY "Users can add participants to their conversations"
  ON public.conversation_participants FOR INSERT
  TO authenticated
  WITH CHECK (
    -- User is adding themselves
    user_id = auth.uid()
    -- OR user is the creator of this conversation and adding the other participant
    OR EXISTS (
      SELECT 1 FROM public.conversations
      WHERE id = conversation_id
      AND created_by = auth.uid()
    )
  );

-- RPC function to safely add another participant
-- This bypasses RLS but checks ownership
CREATE OR REPLACE FUNCTION public.add_conversation_participant(
  p_conversation_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_creator UUID;
BEGIN
  -- Get the creator of the conversation
  SELECT created_by INTO v_creator
  FROM public.conversations
  WHERE id = p_conversation_id;

  -- Only the creator can add participants
  IF v_creator != auth.uid() THEN
    RAISE EXCEPTION 'Only the conversation creator can add participants';
  END IF;

  -- Insert the participant
  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (p_conversation_id, p_user_id)
  ON CONFLICT DO NOTHING;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
