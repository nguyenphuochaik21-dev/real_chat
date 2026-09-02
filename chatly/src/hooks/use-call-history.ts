'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

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
  // Joined profile data
  other_user?: {
    id: string
    display_name: string
    avatar_url: string | null
  }
}

const HISTORY_STATUSES = new Set<CallHistoryItem['status']>([
  'answered',
  'declined',
  'missed',
  'ended',
  'failed',
])

export function useCallHistory(userId: string, limit: number = 50) {
  const [calls, setCalls] = useState<CallHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const fetchCallHistory = useCallback(async () => {
    if (!userId) return

    setLoading(true)
    setError(null)

    try {
      // Fetch call history
      const { data: history, error: historyError } = await supabase
        .from('call_history')
        .select('*')
        .or(`caller_id.eq.${userId},callee_id.eq.${userId}`)
        .order('started_at', { ascending: false })
        .limit(limit)

      if (historyError) throw historyError

      // Get unique user IDs (other participants)
      const otherUserIds =
        history
          ?.map((call) => (call.caller_id === userId ? call.callee_id : call.caller_id))
          .filter((id, index, arr) => arr.indexOf(id) === index) || []

      // Fetch other user profiles
      const profilesMap = new Map<
        string,
        { id: string; display_name: string; avatar_url: string | null }
      >()
      if (otherUserIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name, avatar_url')
          .in('id', otherUserIds)

        profiles?.forEach((profile) => {
          profilesMap.set(profile.id, profile)
        })
      }

      // Combine data
      const enrichedHistory =
        history?.flatMap((call): CallHistoryItem[] => {
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
              direction: call.caller_id === userId ? ('outgoing' as const) : ('incoming' as const),
              other_user: profilesMap.get(otherUserId),
            },
          ]
        }) || []

      setCalls(enrichedHistory)
    } catch (err) {
      console.error('Failed to fetch call history:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch call history')
    } finally {
      setLoading(false)
    }
  }, [userId, limit, supabase])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void fetchCallHistory(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [fetchCallHistory])

  // Subscribe to new call history entries
  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`call-history-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_history',
        },
        (payload) => {
          const newCall = payload.new as CallHistoryItem
          // Only add if it involves this user
          if (newCall.caller_id === userId || newCall.callee_id === userId) {
            fetchCallHistory() // Refresh to get full data with profile
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, supabase, fetchCallHistory])

  const refresh = useCallback(() => {
    fetchCallHistory()
  }, [fetchCallHistory])

  return {
    calls,
    loading,
    error,
    refresh,
  }
}

export function useCallHistoryFiltered(
  userId: string,
  filter: 'all' | 'missed' | 'incoming' | 'outgoing'
) {
  const { calls, loading, error, refresh } = useCallHistory(userId)

  const filteredCalls = calls.filter((call) => {
    if (filter === 'all') return true
    if (filter === 'missed') return call.status === 'missed'
    if (filter === 'incoming') return call.direction === 'incoming' && call.status !== 'missed'
    if (filter === 'outgoing') return call.direction === 'outgoing'
    return true
  })

  return {
    calls: filteredCalls,
    loading,
    error,
    refresh,
  }
}
