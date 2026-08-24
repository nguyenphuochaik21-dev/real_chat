-- Migration: 20250101000014_enable_conversations_realtime.sql
-- Description: Enable realtime for conversations table (for unread badge updates)
-- Created: 2026-08-23

-- Enable realtime on conversations table
-- This allows clients to subscribe to conversation updates (last_message_at changes)
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;

-- Also add conversation_participants for last_read_at changes
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants;
