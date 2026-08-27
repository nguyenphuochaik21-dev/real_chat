-- pg_cron job to automatically send scheduled messages
-- This runs on the server, not in the browser
-- Requires pg_cron extension to be enabled in Supabase Dashboard

-- Create a wrapper function that processes due scheduled messages
CREATE OR REPLACE FUNCTION process_due_scheduled_messages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_message scheduled_messages%ROWTYPE;
BEGIN
  -- Get all due messages (scheduled_at <= now and status = 'pending')
  FOR v_message IN
    SELECT * FROM scheduled_messages
    WHERE status = 'pending'
    AND scheduled_at <= NOW()
    AND scheduled_at IS NOT NULL
  LOOP
    -- Insert the actual message
    INSERT INTO public.messages (
      conversation_id,
      sender_id,
      content,
      content_type,
      media_url,
      media_thumbnail_url,
      media_name,
      media_size,
      media_mime_type,
      reply_to,
      status
    ) VALUES (
      v_message.conversation_id,
      v_message.sender_id,
      v_message.content,
      v_message.content_type::message_content_type,
      v_message.media_url,
      v_message.media_thumbnail_url,
      v_message.media_name,
      v_message.media_size,
      v_message.media_mime_type,
      v_message.reply_to,
      'sent'
    );

    -- Update conversation's last_message_at
    UPDATE public.conversations
    SET last_message_at = NOW()
    WHERE id = v_message.conversation_id;

    -- Mark scheduled message as sent
    UPDATE scheduled_messages
    SET status = 'sent', updated_at = NOW()
    WHERE id = v_message.id;

    RAISE NOTICE 'Auto-sent scheduled message: %', v_message.id;
  END LOOP;
END;
$$;

-- Schedule the job to run every minute
-- cron syntax: minute hour day month weekday
SELECT cron.schedule(
  'process-scheduled-messages',
  '* * * * *',
  'SELECT process_due_scheduled_messages()'
);