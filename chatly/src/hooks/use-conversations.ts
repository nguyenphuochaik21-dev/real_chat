'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  isMissingConversationPageRpc,
  paginateConversationSummaries,
  parseConversationSummaries,
  parseConversationSummaryPage,
  type ConversationSummary,
  type ConversationSummaryPage,
} from '@/lib/conversation-summary'

export type ConversationWithDetails = ConversationSummary

const PAGE_SIZE = 80
const LEGACY_CACHE_TTL_MS = 30_000

export function useConversations(userId: string | null, enabled: boolean, query: string) {
  const [supabase] = useState(() => createClient())
  const [conversations, setConversations] = useState<ConversationWithDetails[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const offsetRef = useRef(0)
  const requestVersionRef = useRef(0)
  const legacySummaryCacheRef = useRef<{
    userId: string
    fetchedAt: number
    conversations: ConversationSummary[]
  } | null>(null)
  const normalizedQuery = query.trim().slice(0, 200)

  const fetchPage = useCallback(
    async (offset: number): Promise<ConversationSummaryPage> => {
      const { data, error: pageError } = await supabase.rpc('get_conversation_summaries_page', {
        p_limit: PAGE_SIZE,
        p_offset: offset,
        p_tab: 'all',
        p_query: normalizedQuery,
      })

      if (!pageError) return parseConversationSummaryPage(data)
      if (!isMissingConversationPageRpc(pageError)) {
        console.warn('Paginated conversation RPC failed; trying the compatibility RPC:', pageError)
      }
      if (!userId) throw pageError

      const cached = legacySummaryCacheRef.current
      let legacyConversations =
        cached?.userId === userId && Date.now() - cached.fetchedAt < LEGACY_CACHE_TTL_MS
          ? cached.conversations
          : null

      if (!legacyConversations) {
        const legacyResult = await supabase.rpc('get_conversation_summaries')
        if (legacyResult.error) throw legacyResult.error
        legacyConversations = parseConversationSummaries(legacyResult.data)
        legacySummaryCacheRef.current = {
          userId,
          fetchedAt: Date.now(),
          conversations: legacyConversations,
        }
      }

      return paginateConversationSummaries(legacyConversations, {
        offset,
        limit: PAGE_SIZE,
        tab: 'all',
        query: normalizedQuery,
      })
    },
    [normalizedQuery, supabase, userId]
  )

  useEffect(() => {
    if (!enabled || !userId) {
      offsetRef.current = 0
      requestVersionRef.current += 1
      return
    }

    const requestVersion = ++requestVersionRef.current
    offsetRef.current = 0
    const timeoutId = window.setTimeout(() => {
      setLoading(true)
      setLoadingMore(false)
      setError(null)
      setHasMore(false)
      setConversations([])
      void (async () => {
        try {
          const page = await fetchPage(0)
          if (requestVersion !== requestVersionRef.current) return
          setConversations(page.items)
          setHasMore(page.hasMore)
          offsetRef.current = page.items.length
        } catch (fetchError) {
          if (requestVersion !== requestVersionRef.current) return
          setError(
            fetchError instanceof Error ? fetchError.message : 'Failed to fetch conversations'
          )
          setConversations([])
        } finally {
          if (requestVersion === requestVersionRef.current) setLoading(false)
        }
      })()
    }, 180)

    return () => {
      window.clearTimeout(timeoutId)
      if (requestVersion === requestVersionRef.current) requestVersionRef.current += 1
    }
  }, [enabled, fetchPage, normalizedQuery, supabase, userId])

  const loadMore = useCallback(async () => {
    if (!enabled || !userId || !hasMore || loadingMore) return

    const requestVersion = requestVersionRef.current
    setLoadingMore(true)
    try {
      const page = await fetchPage(offsetRef.current)
      if (requestVersion !== requestVersionRef.current) return

      setConversations((current) => {
        const existingIds = new Set(current.map((conversation) => conversation.id))
        return [
          ...current,
          ...page.items.filter((conversation) => !existingIds.has(conversation.id)),
        ]
      })
      setHasMore(page.hasMore)
      offsetRef.current += page.items.length
    } catch (fetchError) {
      if (requestVersion === requestVersionRef.current) {
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to fetch conversations')
      }
    } finally {
      if (requestVersion === requestVersionRef.current) setLoadingMore(false)
    }
  }, [enabled, fetchPage, hasMore, loadingMore, userId])

  return { conversations, loading, loadingMore, hasMore, error, loadMore }
}
