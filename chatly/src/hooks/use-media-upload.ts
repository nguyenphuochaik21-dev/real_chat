'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { uploadMedia, isValidMediaFile, getMediaType, type MediaType } from '@/lib/supabase/storage'
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
  const [supabase] = useState(() => createClient())

  const upload = useCallback(
    async (
      file: File,
      mediaGroupId?: string,
      options?: { content?: string; replyTo?: string | null }
    ): Promise<Message | null> => {
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
        const { path } = await uploadMedia(file, conversationId, userId)

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
            content: options?.content?.trim() || file.name,
            content_type: contentType,
            media_url: path, // Store the storage path
            media_name: file.name,
            media_size: file.size,
            media_mime_type: file.type,
            media_group_id: mediaGroupId ?? null,
            reply_to: options?.replyTo ?? null,
            status: 'sent',
          })
          .select()
          .single()

        if (
          msgError &&
          mediaGroupId &&
          (msgError.code === 'PGRST204' || msgError.code === '42703')
        ) {
          const { data: fallbackMessage, error: fallbackError } = await supabase
            .from('messages')
            .insert({
              conversation_id: conversationId,
              sender_id: userId,
              content: options?.content?.trim() || file.name,
              content_type: contentType,
              media_url: path,
              media_name: file.name,
              media_size: file.size,
              media_mime_type: file.type,
              reply_to: options?.replyTo ?? null,
              status: 'sent',
            })
            .select()
            .single()
          if (fallbackError) throw fallbackError
          setUploadState({ uploading: false, progress: 100, error: null })
          onUploadComplete?.(fallbackMessage)
          return fallbackMessage
        }
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
    },
    [conversationId, userId, supabase, onUploadComplete, onError]
  )

  const uploadBatch = useCallback(
    async (
      files: File[],
      options?: {
        mediaGroupId?: string
        content?: string
        replyTo?: string | null
      }
    ): Promise<Message[]> => {
      if (files.length === 0) return []

      for (const file of files) {
        const validation = isValidMediaFile(file)
        if (!validation.valid) {
          const errorMessage = validation.error || 'Invalid file'
          setUploadState({ uploading: false, progress: 0, error: errorMessage })
          onError?.(errorMessage)
          return []
        }
      }

      setUploadState({ uploading: true, progress: 0, error: null })
      const uploadedFiles: { file: File; path: string; contentType: MessageContentType }[] = []

      try {
        for (const [index, file] of files.entries()) {
          const mediaType = getMediaType(file.type) as MediaType
          const { path } = await uploadMedia(file, conversationId, userId)
          const contentType: MessageContentType =
            mediaType === 'image' || mediaType === 'video' || mediaType === 'audio'
              ? mediaType
              : 'file'
          uploadedFiles.push({ file, path, contentType })
          setUploadState({
            uploading: true,
            progress: Math.round(((index + 1) / files.length) * 90),
            error: null,
          })
        }

        const payloads = uploadedFiles.map(({ file, path, contentType }, index) => ({
          conversation_id: conversationId,
          sender_id: userId,
          content: index === 0 ? options?.content?.trim() || file.name : file.name,
          content_type: contentType,
          media_url: path,
          media_name: file.name,
          media_size: file.size,
          media_mime_type: file.type,
          media_group_id: options?.mediaGroupId ?? null,
          reply_to: index === 0 ? (options?.replyTo ?? null) : null,
          status: 'sent' as const,
        }))

        let { data: messages, error: messageError } = await supabase
          .from('messages')
          .insert(payloads)
          .select()

        if (
          messageError &&
          options?.mediaGroupId &&
          (messageError.code === 'PGRST204' || messageError.code === '42703')
        ) {
          const fallbackPayloads = payloads.map((payload) => ({
            conversation_id: payload.conversation_id,
            sender_id: payload.sender_id,
            content: payload.content,
            content_type: payload.content_type,
            media_url: payload.media_url,
            media_name: payload.media_name,
            media_size: payload.media_size,
            media_mime_type: payload.media_mime_type,
            reply_to: payload.reply_to,
            status: payload.status,
          }))
          const fallbackResult = await supabase.from('messages').insert(fallbackPayloads).select()
          messages = fallbackResult.data
          messageError = fallbackResult.error
        }

        if (messageError) throw messageError
        const completedMessages = messages ?? []
        completedMessages.forEach((message) => onUploadComplete?.(message))
        setUploadState({ uploading: false, progress: 100, error: null })
        return completedMessages
      } catch (uploadError) {
        const paths = uploadedFiles.map((item) => item.path)
        if (paths.length > 0) {
          await supabase.storage
            .from('chat-media')
            .remove(paths)
            .catch(() => undefined)
        }
        const errorMessage = uploadError instanceof Error ? uploadError.message : 'Upload failed'
        setUploadState({ uploading: false, progress: 0, error: errorMessage })
        onError?.(errorMessage)
        return []
      }
    },
    [conversationId, onError, onUploadComplete, supabase, userId]
  )

  const reset = useCallback(() => {
    setUploadState({ uploading: false, progress: 0, error: null })
  }, [])

  return {
    upload,
    uploadBatch,
    reset,
    ...uploadState,
  }
}
