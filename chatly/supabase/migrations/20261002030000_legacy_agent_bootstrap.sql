-- Mark only upgrades that still need the encrypted legacy connection copied once.
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS legacy_connection_pending BOOLEAN NOT NULL DEFAULT false;

UPDATE public.ai_agents a SET legacy_connection_pending = true
WHERE a.is_default
  AND NOT EXISTS (SELECT 1 FROM public.ai_connections c WHERE c.agent_id = a.id)
  AND EXISTS (SELECT 1 FROM public.chat_assistant_config c
    WHERE c.id AND c.enabled AND c.connection_encrypted IS NOT NULL);

NOTIFY pgrst, 'reload schema';
