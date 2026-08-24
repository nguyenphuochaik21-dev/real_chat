'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  uploadMedia,
  isValidMediaFile,
  getMediaType,
  type MediaType,
} from '@/lib/supabase/storage'
import type { Tables } from '@/types'

type Message = Tables<'messages'>
type MessageContentType = 'image' | 'video' | 'audio' | 'file'

interface UploadState {
  uploading: boolean
  progress: number
  error: string | null
}

interface UseMediaUploadOptions {
  conversationId: string
  userId: string
  onUploadComplete?: (message: Message) => void
  onError?: (error: string) => void
}

export function useMediaUpload({
  conversationId,
  userId,
  onUploadComplete,
  onError,
}: UseMediaUploadOptions) {
  const [uploadState, setUploadState] = useState<UploadState>({
    uploading: false,
    progress: 0,
    error: null,
  })
  const supabase = createClient()

  const upload = useCallback(async (file: File): Promise<Message | null> => {
    // Validate file
    const validation = isValidMediaFile(file)
    if (!validation.valid) {
      setUploadState({ uploading: false, progress: 0, error: validation.error || 'Invalid file' })
      onError?.(validation.error || 'Invalid file')
      return null
    }

    const mediaType = getMediaType(file.type) as MediaType
    if (!mediaType) {
      setUploadState({ uploading: false, progress: 0, error: 'Unsupported file type' })
      onError?.('Unsupported file type')
      return null
    }

    setUploadState({ uploading: true, progress: 0, error: null })

    try {
      // Upload file to storage
      const { path } = await uploadMedia(file, conversationId, userId, (progress) => {
        setUploadState(prev => ({ ...prev, progress }))
      })

      // Determine content type
      let contentType: MessageContentType = 'file'
      if (mediaType === 'image') contentType = 'image'
      else if (mediaType === 'video') contentType = 'video'
      else if (mediaType === 'audio') contentType = 'audio'

      // Create message with media - store the path, not signed URL
      const { data: message, error: msgError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: userId,
          content: file.name, // Use filename as content for non-text messages
          content_type: contentType,
          media_url: path, // Store the storage path
          media_name: file.name,
          media_size: file.size,
          media_mime_type: file.type,
          status: 'sent',
        })
        .select()
        .single()

      if (msgError) throw msgError

      setUploadState({ uploading: false, progress: 100, error: null })
      onUploadComplete?.(message)

      return message
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Upload failed'
      setUploadState({ uploading: false, progress: 0, error: errorMsg })
      onError?.(errorMsg)
      return null
    }
  }, [conversationId, userId, supabase, onUploadComplete, onError])

  const reset = useCallback(() => {
    setUploadState({ uploading: false, progress: 0, error: null })
  }, [])

  return {
    upload,
    reset,
    ...uploadState,
  }
}
