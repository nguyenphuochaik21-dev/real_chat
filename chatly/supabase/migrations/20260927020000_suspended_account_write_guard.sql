-- Suspension must also apply to direct API calls and SECURITY DEFINER RPC writes.
CREATE OR REPLACE FUNCTION public.guard_suspended_account_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_suspended
  ) THEN
    RAISE EXCEPTION 'Account suspended' USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_suspended_account_write() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  target_table TEXT;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'profiles', 'conversations', 'conversation_participants', 'messages', 'friendships',
    'scheduled_messages', 'message_reactions', 'starred_messages', 'user_blocks',
    'conversation_labels', 'conversation_label_map', 'group_join_requests',
    'call_sessions', 'call_history', 'support_requests', 'typing_indicators', 'push_subscriptions'
  ] LOOP
    EXECUTE FORMAT('CREATE TRIGGER guard_suspended_account_write
      BEFORE INSERT OR UPDATE OR DELETE ON public.%I
      FOR EACH STATEMENT EXECUTE FUNCTION public.guard_suspended_account_write()', target_table);
  END LOOP;
END;
$$;

CREATE TRIGGER guard_suspended_account_write
  BEFORE INSERT OR UPDATE OR DELETE ON storage.objects
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_suspended_account_write();

CREATE OR REPLACE FUNCTION public.can_send_message(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND NOT is_suspended)
    AND public.is_conversation_participant(p_conversation_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.conversations AS conversation
      JOIN public.conversation_participants AS other
        ON other.conversation_id = conversation.id AND other.user_id <> auth.uid()
      JOIN public.user_blocks AS block
        ON (block.blocker_id = auth.uid() AND block.blocked_id = other.user_id)
        OR (block.blocker_id = other.user_id AND block.blocked_id = auth.uid())
      WHERE conversation.id = p_conversation_id AND conversation.type = 'direct'
    );
$$;

REVOKE ALL ON FUNCTION public.can_send_message(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_send_message(UUID) TO authenticated;
