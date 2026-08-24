-- Migration: 20250101000012_db_presence_and_delivered_trigger.sql
-- Description: Database-backed presence tracking and auto-delivered trigger

-- ============================================================================
-- PART 1: PRESENCE TRACKING (Database-backed, replaces Presence API)
-- ============================================================================

-- Ensure status column exists with proper constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN status TEXT DEFAULT 'offline';
  END IF;
END$$;

-- Add CHECK constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'profiles_status_check'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_status_check
    CHECK (status IN ('online', 'offline', 'away', 'busy'));
  END IF;
END$$;

-- Create enum for user status (optional, for type safety)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_status') THEN
    CREATE TYPE user_status AS ENUM ('online', 'offline', 'away', 'busy');
  END IF;
END$$;

-- RPC function: Set user as online
CREATE OR REPLACE FUNCTION public.set_user_online()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles
  SET
    status = 'online',
    last_seen = NOW()
  WHERE id = auth.uid();
END;
$$;

-- RPC function: Set user as offline
CREATE OR REPLACE FUNCTION public.set_user_offline()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles
  SET
    status = 'offline',
    last_seen = NOW()
  WHERE id = auth.uid();
END;
$$;

-- RPC function: Set user as away
CREATE OR REPLACE FUNCTION public.set_user_away()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles
  SET
    status = 'away',
    last_seen = NOW()
  WHERE id = auth.uid();
END;
$$;

-- RPC function: Set user as busy
CREATE OR REPLACE FUNCTION public.set_user_busy()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles
  SET
    status = 'busy',
    last_seen = NOW()
  WHERE id = auth.uid();
END;
$$;

-- Function to handle user disconnect (set offline automatically)
CREATE OR REPLACE FUNCTION public.handle_user_disconnect()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles
  SET
    status = 'offline',
    last_seen = NOW()
  WHERE id = auth.uid();
END;
$$;

-- ============================================================================
-- PART 2: AUTO-DELIVERED TRIGGER
-- ============================================================================

-- Function to auto-mark messages as delivered when sent to a direct conversation
CREATE OR REPLACE FUNCTION public.handle_new_message_delivered()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conversation_type TEXT;
BEGIN
  -- Only process for new messages with 'sent' status
  IF NEW.status = 'sent' THEN
    -- Get conversation type
    SELECT type INTO v_conversation_type
    FROM public.conversations
    WHERE id = NEW.conversation_id;

    -- For direct messages, auto-deliver to the other participant
    IF v_conversation_type = 'direct' THEN
      -- Mark as delivered
      NEW.status = 'delivered';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger: Auto-deliver messages (runs BEFORE insert to modify status)
DROP TRIGGER IF EXISTS on_message_auto_deliver ON public.messages;
CREATE TRIGGER on_message_auto_deliver
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_message_delivered();

-- ============================================================================
-- PART 3: UPDATE RLS POLICIES
-- ============================================================================

-- Ensure users can update their own status
DROP POLICY IF EXISTS "Users can update own status" ON public.profiles;
CREATE POLICY "Users can update own status"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Users can call RPC to update their own status
GRANT EXECUTE ON FUNCTION public.set_user_online() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_offline() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_away() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_busy() TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_user_disconnect() TO authenticated;

-- Enable realtime for profiles table (for presence subscription)
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
