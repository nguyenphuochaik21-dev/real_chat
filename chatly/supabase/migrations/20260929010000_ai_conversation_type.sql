-- Commit the enum addition before using it in the following migration.
ALTER TYPE public.conversation_type ADD VALUE IF NOT EXISTS 'ai';
