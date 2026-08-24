-- Migration: 20250101000009_final_rls_fix.sql
-- Description: Final RLS policies fix for all tables

-- ============================================
-- CONVERSATIONS TABLE POLICIES
-- ============================================

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Participants can view conversation" ON public.conversations;
DROP POLICY IF EXISTS "Creator can view own conversation" ON public.conversations;

-- SELECT: Allow users to see conversations they created OR are participants of
CREATE POLICY "conversations_select" ON public.conversations
  FOR SELECT USING (
    created_by = auth.uid() OR public.is_conversation_participant(id)
  );

-- INSERT: Allow any authenticated user to create a conversation
CREATE POLICY "conversations_insert" ON public.conversations
  FOR INSERT WITH CHECK (created_by = auth.uid());

-- UPDATE: Allow participants to update conversation metadata
CREATE POLICY "conversations_update" ON public.conversations
  FOR UPDATE USING (public.is_conversation_participant(id));

-- ============================================
-- CONVERSATION_PARTICIPANTS TABLE POLICIES
-- ============================================

DROP POLICY IF EXISTS "Participants can view other participants" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can join conversations" ON public.conversation_participants;
DROP POLICY IF EXISTS "Users can add participants to their conversations" ON public.conversation_participants;

-- SELECT: Allow participants to see other participants
CREATE POLICY "participants_select" ON public.conversation_participants
  FOR SELECT USING (public.is_conversation_participant(conversation_id));

-- INSERT: Allow users to add themselves, OR creators to add others
CREATE POLICY "participants_insert" ON public.conversation_participants
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.conversations
      WHERE id = conversation_id AND created_by = auth.uid()
    )
  );

-- UPDATE: Allow users to update their own participation
CREATE POLICY "participants_update" ON public.conversation_participants
  FOR UPDATE USING (user_id = auth.uid());

-- ============================================
-- MESSAGES TABLE POLICIES
-- ============================================

DROP POLICY IF EXISTS "Participants can view messages" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;

-- SELECT: Allow conversation participants to view messages
CREATE POLICY "messages_select" ON public.messages
  FOR SELECT USING (public.is_conversation_participant(conversation_id));

-- INSERT: Allow participants to send messages
CREATE POLICY "messages_insert" ON public.messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND public.is_conversation_participant(conversation_id)
  );

-- UPDATE: Allow senders to update their own messages
CREATE POLICY "messages_update" ON public.messages
  FOR UPDATE USING (sender_id = auth.uid());

-- DELETE: Allow senders to delete their own messages
DROP POLICY IF EXISTS "Senders can delete own messages" ON public.messages;
CREATE POLICY "messages_delete" ON public.messages
  FOR DELETE USING (sender_id = auth.uid());

-- ============================================
-- RPC FUNCTION (ensure it exists)
-- ============================================

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
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
