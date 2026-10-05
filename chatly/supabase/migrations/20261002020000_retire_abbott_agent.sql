-- Abbott AI was an obsolete test agent, but its conversations and turns are user history.
-- Keep a historical name and ID on each conversation before removing its active configuration.
ALTER TABLE public.ai_conversations
  ADD COLUMN IF NOT EXISTS historical_agent_id UUID;

ALTER TABLE public.ai_conversations ALTER COLUMN agent_id DROP NOT NULL;
ALTER TABLE public.ai_conversations
  DROP CONSTRAINT IF EXISTS ai_conversations_agent_id_fkey;
ALTER TABLE public.ai_conversations
  ADD CONSTRAINT ai_conversations_agent_id_fkey
  FOREIGN KEY (agent_id) REFERENCES public.ai_agents(id) ON DELETE SET NULL;

DO $$
DECLARE target UUID := '3861bb6a-5dc1-4f77-86a6-a180192a3f96';
BEGIN
  IF EXISTS (SELECT 1 FROM public.ai_agents
    WHERE id = target AND name = 'Abbott AI' AND NOT is_default) THEN
    UPDATE public.ai_conversations
      SET historical_agent_id = target,
        agent_name = COALESCE(agent_name, 'Abbott AI')
      WHERE agent_id = target;
    DELETE FROM public.ai_connections WHERE agent_id = target;
    DELETE FROM public.ai_agents WHERE id = target;
    IF EXISTS (SELECT 1 FROM public.ai_agents WHERE id = target) THEN
      RAISE EXCEPTION 'Abbott AI cleanup did not finish';
    END IF;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
