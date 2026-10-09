-- A cleared direct conversation stays in shared storage but must stay out of this user's list.
DO $$
DECLARE
  definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.get_conversation_summaries_page(integer, integer, text, text)'::regprocedure
  ) INTO definition;

  IF position('mine.hidden_at IS NULL' IN definition) > 0 THEN
    RETURN;
  END IF;

  IF position('WHERE mine.user_id = v_user_id' IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected conversation page function definition';
  END IF;

  definition := replace(
    definition,
    'WHERE mine.user_id = v_user_id',
    'WHERE mine.user_id = v_user_id AND mine.hidden_at IS NULL'
  );

  EXECUTE definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
