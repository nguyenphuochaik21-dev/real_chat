-- Migration: 20250101000008_debug_and_fix_conversations.sql
-- Description: Debug and fix RLS policy for conversations table

-- First, let's check what policies exist
-- Run this query first to see current policies:
-- SELECT * FROM pg_policies WHERE tablename = 'conversations';

-- Drop the existing policy and recreate it with proper checks
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;

-- More explicit policy that allows any authenticated user to create a conversation
-- where they set themselves as the creator
CREATE POLICY "Users can create conversations"
  ON public.conversations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());

-- Also, let's add a SELECT policy that allows the creator to see their own conversations
DROP POLICY IF EXISTS "Creator can view own conversation" ON public.conversations;
CREATE POLICY "Creator can view own conversation"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.is_conversation_participant(id)
  );

-- And ensure participants can view
DROP POLICY IF EXISTS "Participants can view conversation" ON public.conversations;
CREATE POLICY "Participants can view conversation"
  ON public.conversations FOR SELECT
  TO authenticated
  USING (public.is_conversation_participant(id));
