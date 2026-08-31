'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/types'

type Message = Tables<'messages'>

interface MediaItem {
  id: string
  url: string
  thumbnailUrl: string | null
  type: 'image' | 'video' | 'audio' | 'file'
  name: string | null
  size: number | null
  mimeType: string | null
  createdAt: string
  senderId: string | null
}

interface UseConversationMediaOptions {
  conversationId: string | null
  limit?: number
}

export function useConversationMedia({ conversationId, limit = 6 }: UseConversationMediaOptions) {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchMedia = useCallback(async () => {
    if (!conversationId) {
      setMediaItems([])
      setTotalCount(0)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      // Get total count first
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', conversationId)
        .neq('content_type', 'text')

      setTotalCount(count || 0)

      // Fetch media messages, newest first
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .neq('content_type', 'text')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error

      const items: MediaItem[] = (data || []).map((msg: Message) => ({
        id: msg.id,
        url: msg.media_url || '',
        thumbnailUrl: msg.media_thumbnail_url,
        type: (msg.content_type || 'file') as MediaItem['type'],
        name: msg.media_name,
        size: msg.media_size,
        mimeType: msg.media_mime_type,
        createdAt: msg.created_at || '',
        senderId: msg.sender_id,
      }))

      setMediaItems(items)
    } catch (err) {
      console.error('Failed to fetch media:', err)
    } finally {
      setLoading(false)
    }
  }, [conversationId, limit, supabase])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void fetchMedia(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [fetchMedia])

  return {
    mediaItems,
    totalCount,
    loading,
    refetch: fetchMedia,
  }
}
