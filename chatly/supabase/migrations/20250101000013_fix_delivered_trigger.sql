-- Migration: 20250101000013_fix_delivered_trigger.sql
-- Description: Fix auto-delivered trigger - only deliver when recipient is online
-- Created: 2026-08-23

-- ============================================================================
-- FIX: Smart delivered trigger that only marks as delivered when recipient is online
-- ============================================================================

-- Replace the existing function with smarter logic
CREATE OR REPLACE FUNCTION public.handle_new_message_delivered()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conversation_type TEXT;
  v_recipient_id UUID;
  v_recipient_status TEXT;
  v_sender_id UUID;
BEGIN
  -- Only process for messages with 'sent' status
  IF NEW.status = 'sent' THEN
    -- Get conversation type and sender
    SELECT type, created_by INTO v_conversation_type, v_sender_id
    FROM public.conversations
    WHERE id = NEW.conversation_id;

    -- For direct messages, check if recipient is online
    IF v_conversation_type = 'direct' THEN
      -- Get the recipient (the other participant, not the sender)
      SELECT cp.user_id INTO v_recipient_id
      FROM public.conversation_participants cp
      WHERE cp.conversation_id = NEW.conversation_id
        AND cp.user_id != NEW.sender_id
      LIMIT 1;

      -- Check recipient's online status
      IF v_recipient_id IS NOT NULL THEN
        SELECT status INTO v_recipient_status
        FROM public.profiles
        WHERE id = v_recipient_id;

        -- Only mark as delivered if recipient is online
        IF v_recipient_status = 'online' THEN
          NEW.status = 'delivered';
        END IF;
        -- If offline/away/busy, keep as 'sent' until recipient comes online
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate the trigger (same as before, just referencing the updated function)
DROP TRIGGER IF EXISTS on_message_auto_deliver ON public.messages;
CREATE TRIGGER on_message_auto_deliver
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_message_delivered();

-- ============================================================================
-- ADDITIONAL: Function to mark messages as delivered when recipient comes online
-- This handles the case where a message was sent while recipient was offline
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mark_offline_messages_delivered(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- For all direct conversations where this user is a participant
  -- Mark any 'sent' messages as 'delivered' where the other person just came online
  UPDATE public.messages m
  SET status = 'delivered'
  FROM public.conversations c
  JOIN public.conversation_participants cp ON cp.conversation_id = c.id
  WHERE m.conversation_id = c.id
    AND c.type = 'direct'
    AND m.status = 'sent'
    AND cp.user_id = p_user_id
    AND m.sender_id != p_user_id;
END;
$$;

-- When a user's status changes to 'online', mark pending messages as delivered
CREATE OR REPLACE FUNCTION public.trigger_deliver_online()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If status changed TO online
  IF NEW.status = 'online' AND OLD.status != 'online' THEN
    -- Call the function to mark pending messages as delivered
    PERFORM public.mark_offline_messages_delivered(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger on profile status changes
DROP TRIGGER IF EXISTS on_profile_status_change_deliver ON public.profiles;
CREATE TRIGGER on_profile_status_change_deliver
  AFTER UPDATE OF status ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_deliver_online();

-- Grant permission
GRANT EXECUTE ON FUNCTION public.mark_offline_messages_delivered TO authenticated;
