'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type CallHistoryFilter = 'all' | 'missed' | 'incoming' | 'outgoing'

export interface CallHistoryItem {
  id: string
  caller_id: string
  callee_id: string
  conversation_id: string | null
  call_type: 'voice' | 'video'
  direction: 'incoming' | 'outgoing'
  status: 'answered' | 'declined' | 'missed' | 'ended' | 'failed'
  duration_seconds: number
  started_at: string
  ended_at: string | null
  created_at: string
  other_user?: {
    id: string
    display_name: string
    avatar_url: string | null
    is_verified: boolean
  }
}

const CALL_HISTORY_PAGE_SIZE = 40
const HISTORY_STATUSES = new Set<CallHistoryItem['status']>([
  'answered',
  'declined',
  'missed',
  'ended',
  'failed',
])

export function useCallHistory(userId: string, filter: CallHistoryFilter = 'all') {
  const [calls, setCalls] = useState<CallHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [supabase] = useState(() => createClient())

  const fetchPage = useCallback(
    async (offset: number, replace: boolean) => {
      if (!userId) {
        setCalls([])
        setHasMore(false)
        setLoading(false)
        return
      }

      if (replace) setLoading(true)
      else setLoadingMore(true)
      setError(null)

      try {
        let query = supabase
          .from('call_history')
          .select(
            'id, caller_id, callee_id, conversation_id, call_type, status, duration_seconds, started_at, ended_at, created_at'
          )
          .order('started_at', { ascending: false })
          .order('id', { ascending: false })
          .range(offset, offset + CALL_HISTORY_PAGE_SIZE)

        if (filter === 'incoming') {
          query = query.eq('callee_id', userId).neq('status', 'missed')
        } else if (filter === 'outgoing') {
          query = query.eq('caller_id', userId)
        } else {
          query = query.or(`caller_id.eq.${userId},callee_id.eq.${userId}`)
          if (filter === 'missed') query = query.eq('status', 'missed')
        }

        const { data, error: historyError } = await query
        if (historyError) throw historyError

        const page = (data ?? []).slice(0, CALL_HISTORY_PAGE_SIZE)
        const otherUserIds = Array.from(
          new Set(page.map((call) => (call.caller_id === userId ? call.callee_id : call.caller_id)))
        )
        const profilesMap = new Map<
          string,
          { id: string; display_name: string; avatar_url: string | null; is_verified: boolean }
        >()

        if (otherUserIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, display_name, avatar_url, is_verified')
            .in('id', otherUserIds)
          profiles?.forEach((profile) => profilesMap.set(profile.id, profile))
        }

        const enrichedHistory = page.flatMap((call): CallHistoryItem[] => {
          if (
            !call.call_type ||
            !call.status ||
            !HISTORY_STATUSES.has(call.status as CallHistoryItem['status'])
          ) {
            return []
          }

          const otherUserId = call.caller_id === userId ? call.callee_id : call.caller_id
          const startedAt = call.started_at ?? call.created_at
          if (!startedAt) return []

          return [
            {
              ...call,
              call_type: call.call_type,
              status: call.status as CallHistoryItem['status'],
              duration_seconds: call.duration_seconds ?? 0,
              started_at: startedAt,
              created_at: call.created_at ?? startedAt,
              direction: call.caller_id === userId ? 'outgoing' : 'incoming',
              other_user: profilesMap.get(otherUserId),
            },
          ]
        })

        setHasMore((data?.length ?? 0) > CALL_HISTORY_PAGE_SIZE)
        setCalls((current) => {
          if (replace) return enrichedHistory
          const existingIds = new Set(current.map((call) => call.id))
          return [...current, ...enrichedHistory.filter((call) => !existingIds.has(call.id))]
        })
      } catch (fetchError) {
        console.error('Failed to fetch call history:', fetchError)
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to fetch call history')
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [filter, supabase, userId]
  )

  const refresh = useCallback(() => fetchPage(0, true), [fetchPage])
  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return Promise.resolve()
    return fetchPage(calls.length, false)
  }, [calls.length, fetchPage, hasMore, loading, loadingMore])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void refresh(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [refresh])

  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`call-history-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'call_history' },
        (payload) => {
          const newCall = payload.new as { caller_id?: string; callee_id?: string }
          if (newCall.caller_id === userId || newCall.callee_id === userId) void refresh()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [refresh, supabase, userId])

  return { calls, loading, loadingMore, hasMore, error, refresh, loadMore }
}

export function useCallHistoryFiltered(userId: string, filter: CallHistoryFilter) {
  return useCallHistory(userId, filter)
}
