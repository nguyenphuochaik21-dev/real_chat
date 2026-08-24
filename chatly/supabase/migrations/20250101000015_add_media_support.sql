-- Migration: 20250101000015_add_media_support.sql
-- Description: Add media/file support to messages

-- Create content_type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_content_type') THEN
    CREATE TYPE message_content_type AS ENUM ('text', 'image', 'video', 'audio', 'file');
  END IF;
END$$;

-- Add media columns to messages
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS content_type message_content_type DEFAULT 'text',
ADD COLUMN IF NOT EXISTS media_url TEXT,
ADD COLUMN IF NOT EXISTS media_thumbnail_url TEXT,
ADD COLUMN IF NOT EXISTS media_name TEXT,
ADD COLUMN IF NOT EXISTS media_size BIGINT,
ADD COLUMN IF NOT EXISTS media_mime_type TEXT;

-- Create storage bucket for chat media
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-media',
  'chat-media',
  false,
  52428800, -- 50MB
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/webm',
    'audio/mpeg',
    'audio/ogg',
    'audio/wav',
    'application/pdf',
    'application/zip',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- RLS for storage bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname = 'Users can upload chat media'
  ) THEN
    CREATE POLICY "Users can upload chat media"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'chat-media'
      AND auth.uid()::text = (storage.foldername(name))[1]
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname = 'Participants can view chat media'
  ) THEN
    CREATE POLICY "Participants can view chat media"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'chat-media');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname = 'Users can delete own chat media'
  ) THEN
    CREATE POLICY "Users can delete own chat media"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'chat-media'
      AND auth.uid()::text = (storage.foldername(name))[1]
    );
  END IF;
END$$;

-- Create index for media queries
CREATE INDEX IF NOT EXISTS idx_messages_media ON public.messages(conversation_id, content_type) WHERE content_type != 'text';
