-- Migration: 20250101000010_add_presence_and_read_receipts.sql
-- Description: Add presence tracking and enhanced read receipts

-- Add status column to profiles for simple presence (optional, Presence API handles realtime)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'offline'
CHECK (status IN ('online', 'offline', 'away', 'busy'));

-- Add last_seen index for efficient presence queries
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON public.profiles(last_seen);

-- Add is_read column to messages for simpler read tracking (optional enhancement)
-- The current status field (sent/delivered/read) already handles this

-- Update RLS to allow reading status of other users for presence display
-- Users should be able to see each other's status for chat functionality
DROP POLICY IF EXISTS "Profiles are viewable by authenticated users" ON public.profiles;
CREATE POLICY "Profiles are viewable by authenticated users"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Allow users to update their own status
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Function to broadcast presence changes (optional, for webhook integration)
CREATE OR REPLACE FUNCTION public.broadcast_presence_change()
RETURNS TRIGGER AS $$
BEGIN
  -- This could trigger a webhook or additional logic if needed
  -- For now, Supabase Realtime Presence API handles this automatically
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Comment on enhanced read receipt columns
COMMENT ON COLUMN public.messages.status IS 'Message delivery status: sent, delivered, or read';
COMMENT ON COLUMN public.conversation_participants.last_read_at IS 'Timestamp when user last read messages in this conversation';
