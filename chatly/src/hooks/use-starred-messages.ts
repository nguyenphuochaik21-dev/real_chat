'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getStarredMessages, toggleStar as toggleStarAction } from '@/lib/actions/messages'
import type { Tables } from '@/types'

type Message = Tables<'messages'>

export function useStarredMessages(userId: string | null) {
  const [starredMessages, setStarredMessages] = useState<Message[]>([])
  const [starredMessageIds, setStarredMessageIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const fetchStarredMessages = useCallback(async () => {
    if (!userId) {
      setStarredMessages([])
      setStarredMessageIds(new Set())
      return
    }

    setLoading(true)
    try {
      const messages = await getStarredMessages()
      setStarredMessages(messages)
      setStarredMessageIds(new Set(messages.map((m) => m.id)))
      setError(null)
    } catch (err) {
      console.error('Failed to fetch starred messages:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [userId])

  // Initial fetch
  useEffect(() => {
    const timeoutId = window.setTimeout(() => void fetchStarredMessages(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [fetchStarredMessages])

  // Subscribe to starred message changes
  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`starred-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'starred_messages',
        },
        () => {
          fetchStarredMessages()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId, supabase, fetchStarredMessages])

  const toggleStarMessage = useCallback(
    async (messageId: string) => {
      const wasStarred = starredMessageIds.has(messageId)

      // Optimistic update
      setStarredMessageIds((prev) => {
        const next = new Set(prev)
        if (wasStarred) {
          next.delete(messageId)
        } else {
          next.add(messageId)
        }
        return next
      })

      try {
        const result = await toggleStarAction(messageId)
        if (result.success) {
          // Refresh the full list to get updated data
          fetchStarredMessages()
        } else {
          // Revert on error
          setStarredMessageIds((prev) => {
            const next = new Set(prev)
            if (wasStarred) {
              next.add(messageId)
            } else {
              next.delete(messageId)
            }
            return next
          })
        }
        return !wasStarred
      } catch (err) {
        console.error('Failed to toggle star:', err)
        // Revert on error
        setStarredMessageIds((prev) => {
          const next = new Set(prev)
          if (wasStarred) {
            next.add(messageId)
          } else {
            next.delete(messageId)
          }
          return next
        })
        return wasStarred
      }
    },
    [starredMessageIds, fetchStarredMessages]
  )

  const isStarred = useCallback(
    (messageId: string) => {
      return starredMessageIds.has(messageId)
    },
    [starredMessageIds]
  )

  return {
    starredMessages,
    starredMessageIds,
    loading,
    error,
    toggleStarMessage,
    isStarred,
    refetch: fetchStarredMessages,
  }
}
