-- Migration: 20250101000006_create_realtime.sql
-- Description: Enable realtime for messages table

-- Enable realtime on messages table
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
