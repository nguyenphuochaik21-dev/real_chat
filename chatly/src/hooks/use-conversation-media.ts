'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
  enabled?: boolean
}

export function useConversationMedia({
  conversationId,
  limit = 6,
  enabled = true,
}: UseConversationMediaOptions) {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loadedConversationId, setLoadedConversationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [supabase] = useState(() => createClient())
  const requestVersionRef = useRef(0)
  const invalidateRequest = useCallback(() => {
    requestVersionRef.current++
  }, [])

  const fetchMedia = useCallback(
    async (requestedLimit = limit) => {
      const requestVersion = ++requestVersionRef.current
      if (!conversationId || !enabled) {
        setMediaItems([])
        setTotalCount(0)
        setLoadedConversationId(null)
        setLoading(false)
        return
      }

      const targetConversationId = conversationId
      setLoading(true)
      setError(false)
      try {
        const [{ count, error: countError }, { data, error }] = await Promise.all([
          supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', targetConversationId)
            .in('content_type', ['image', 'video', 'audio', 'file'])
            .is('deleted_at', null)
            .not('media_url', 'is', null),
          supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', targetConversationId)
            .in('content_type', ['image', 'video', 'audio', 'file'])
            .is('deleted_at', null)
            .not('media_url', 'is', null)
            .order('created_at', { ascending: false })
            .limit(requestedLimit),
        ])

        if (error) throw error
        if (countError) throw countError
        if (requestVersion !== requestVersionRef.current) return
        setTotalCount(count || 0)

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
        setLoadedConversationId(targetConversationId)
      } catch (err) {
        if (requestVersion !== requestVersionRef.current) return
        setError(true)
        setMediaItems([])
        setTotalCount(0)
        setLoadedConversationId(targetConversationId)
        console.error('Failed to fetch media:', err)
      } finally {
        if (requestVersion === requestVersionRef.current) setLoading(false)
      }
    },
    [conversationId, enabled, limit, supabase]
  )

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void fetchMedia(), 0)
    return () => {
      window.clearTimeout(timeoutId)
      invalidateRequest()
    }
  }, [fetchMedia, invalidateRequest])

  useEffect(() => {
    if (!enabled || !conversationId) return
    let refreshTimer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => void fetchMedia(), 150)
    }
    const channel = supabase
      .channel(`media-changes-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (payload.new.media_url) refresh()
        }
      )
      // DELETE events contain only the primary key under RLS, not a conversation filter.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, refresh)
      .subscribe()
    return () => {
      clearTimeout(refreshTimer)
      void supabase.removeChannel(channel)
    }
  }, [conversationId, enabled, fetchMedia, supabase])

  const hasCurrentConversation = loadedConversationId === conversationId

  return {
    mediaItems: hasCurrentConversation ? mediaItems : [],
    totalCount: hasCurrentConversation ? totalCount : 0,
    loading: Boolean(enabled && conversationId && (loading || !hasCurrentConversation)),
    error: hasCurrentConversation && error,
    refetch: fetchMedia,
  }
}
