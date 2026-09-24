'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/types'

type Message = Tables<'messages'>
type MediaRecord = Pick<
  Message,
  | 'id'
  | 'media_url'
  | 'media_thumbnail_url'
  | 'content_type'
  | 'media_name'
  | 'media_size'
  | 'media_mime_type'
  | 'created_at'
  | 'sender_id'
>

const MEDIA_SELECT =
  'id,media_url,media_thumbnail_url,content_type,media_name,media_size,media_mime_type,created_at,sender_id'

function toMediaItem(msg: MediaRecord): MediaItem {
  return {
    id: msg.id,
    url: msg.media_url || '',
    thumbnailUrl: msg.media_thumbnail_url,
    type: (msg.content_type || 'file') as MediaItem['type'],
    name: msg.media_name,
    size: msg.media_size,
    mimeType: msg.media_mime_type,
    createdAt: msg.created_at || '',
    senderId: msg.sender_id,
  }
}

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
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState(false)
  const [error, setError] = useState(false)
  const [supabase] = useState(() => createClient())
  const requestVersionRef = useRef(0)
  const loadedLimitRef = useRef(limit)
  const visibleMediaIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    visibleMediaIdsRef.current = new Set(mediaItems.map((item) => item.id))
  }, [mediaItems])
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
        setLoadingMore(false)
        return
      }

      const targetConversationId = conversationId
      setLoading(true)
      setLoadingMore(false)
      setError(false)
      setMoreError(false)
      try {
        const { count, data, error } = await supabase
          .from('messages')
          .select(MEDIA_SELECT, { count: 'exact' })
          .eq('conversation_id', targetConversationId)
          .in('content_type', ['image', 'video', 'audio', 'file'])
          .is('deleted_at', null)
          .not('media_url', 'is', null)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(0, Math.max(1, requestedLimit, loadedLimitRef.current) - 1)

        if (error) throw error
        if (requestVersion !== requestVersionRef.current) return
        setTotalCount(count || 0)
        setMediaItems((data || []).map(toMediaItem))
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

  const loadMore = useCallback(async () => {
    const offset = mediaItems.length
    if (
      !conversationId ||
      !enabled ||
      loadedConversationId !== conversationId ||
      loading ||
      loadingMore ||
      offset >= totalCount
    ) {
      return
    }
    const pageSize = Math.max(20, limit)
    loadedLimitRef.current = Math.max(loadedLimitRef.current, offset + pageSize)
    const requestVersion = ++requestVersionRef.current
    setLoading(false)
    setLoadingMore(true)
    setMoreError(false)
    try {
      const { data, error: pageError } = await supabase
        .from('messages')
        .select(MEDIA_SELECT)
        .eq('conversation_id', conversationId)
        .in('content_type', ['image', 'video', 'audio', 'file'])
        .is('deleted_at', null)
        .not('media_url', 'is', null)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + pageSize - 1)
      if (pageError) throw pageError
      if (requestVersion !== requestVersionRef.current) return
      loadedLimitRef.current = Math.max(loadedLimitRef.current, offset + (data?.length || 0))
      setMediaItems((current) => {
        const known = new Set(current.map((item) => item.id))
        return [...current, ...(data || []).map(toMediaItem).filter((item) => !known.has(item.id))]
      })
    } catch {
      if (requestVersion === requestVersionRef.current) setMoreError(true)
    } finally {
      if (requestVersion === requestVersionRef.current) setLoadingMore(false)
    }
  }, [
    conversationId,
    enabled,
    limit,
    loadedConversationId,
    loading,
    loadingMore,
    mediaItems.length,
    supabase,
    totalCount,
  ])

  useEffect(() => {
    loadedLimitRef.current = limit
    const timeoutId = window.setTimeout(() => void fetchMedia(limit), 0)
    return () => {
      window.clearTimeout(timeoutId)
      invalidateRequest()
    }
  }, [fetchMedia, invalidateRequest, limit])

  useEffect(() => {
    if (!enabled || !conversationId) return
    let refreshTimer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => void fetchMedia(loadedLimitRef.current), 150)
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
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (payload.new.media_url || visibleMediaIdsRef.current.has(payload.new.id)) refresh()
        }
      )
      // DELETE payloads expose only the primary key under RLS, so ignore unrelated rows.
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload) => {
          if (visibleMediaIdsRef.current.has(payload.old.id)) refresh()
        }
      )
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
    loadingMore: hasCurrentConversation && loadingMore,
    moreError: hasCurrentConversation && moreError,
    hasMore: hasCurrentConversation && mediaItems.length < totalCount,
    loadMore,
    refetch: fetchMedia,
  }
}
