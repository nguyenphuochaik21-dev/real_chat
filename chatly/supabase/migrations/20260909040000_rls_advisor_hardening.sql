-- Resolve database-advisor warnings without weakening any existing row-level policy.

ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.broadcast_presence_change() SET search_path = public;
ALTER FUNCTION public.handle_new_message_delivered() SET search_path = public;
ALTER FUNCTION public.trigger_deliver_online() SET search_path = public;
ALTER FUNCTION public.update_message_search_vector() SET search_path = public;
ALTER FUNCTION public.prevent_self_block() SET search_path = public;
ALTER FUNCTION public.mark_offline_messages_delivered(UUID) SET search_path = public;
ALTER FUNCTION public.is_call_participant(UUID) SET search_path = public;
ALTER FUNCTION public.can_view_call_session(UUID) SET search_path = public;
ALTER FUNCTION public.cleanup_old_typing_indicators() SET search_path = public;

-- These legacy policies duplicate stricter policies created by later migrations.
DROP POLICY IF EXISTS "Users can update own participation"
  ON public.conversation_participants;
DROP POLICY IF EXISTS "Participants can update conversation"
  ON public.conversations;
DROP POLICY IF EXISTS "Senders can update own messages"
  ON public.messages;
DROP POLICY IF EXISTS "Users can update own status"
  ON public.profiles;

-- Cache auth.uid() once per statement instead of recalculating it for every row.
DO $$
DECLARE
  policy_record RECORD;
  using_expression TEXT;
  check_expression TEXT;
  alter_statement TEXT;
BEGIN
  FOR policy_record IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        COALESCE(qual, '') LIKE '%auth.uid()%'
        OR COALESCE(with_check, '') LIKE '%auth.uid()%'
      )
  LOOP
    using_expression := REPLACE(policy_record.qual, 'auth.uid()', '(SELECT auth.uid())');
    check_expression := REPLACE(policy_record.with_check, 'auth.uid()', '(SELECT auth.uid())');
    alter_statement := FORMAT(
      'ALTER POLICY %I ON %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );

    IF using_expression IS NOT NULL THEN
      alter_statement := alter_statement || FORMAT(' USING (%s)', using_expression);
    END IF;
    IF check_expression IS NOT NULL THEN
      alter_statement := alter_statement || FORMAT(' WITH CHECK (%s)', check_expression);
    END IF;

    EXECUTE alter_statement;
  END LOOP;
END;
$$;

