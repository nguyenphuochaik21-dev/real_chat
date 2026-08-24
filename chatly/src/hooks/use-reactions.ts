'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  toggleReaction as toggleReactionAction,
  getMessageReactions as getMessageReactionsAction,
  type MessageReaction
} from '@/lib/actions/messages'

export function useReactions(messageId: string | null) {
  const [reactions, setReactions] = useState<MessageReaction[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const fetchReactions = useCallback(async () => {
    if (!messageId) {
      setReactions([])
      return
    }

    setLoading(true)
    try {
      const data = await getMessageReactionsAction(messageId)
      setReactions(data)
      setError(null)
    } catch (err) {
      console.error('Failed to fetch reactions:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [messageId])

  // Initial fetch
  useEffect(() => {
    fetchReactions()
  }, [fetchReactions])

  // Subscribe to reaction changes
  useEffect(() => {
    if (!messageId) return

    const channel = supabase
      .channel(`reactions-${messageId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
          filter: `message_id=eq.${messageId}`,
        },
        () => {
          fetchReactions()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [messageId, supabase, fetchReactions])

  const toggleReaction = useCallback(async (emoji: string) => {
    if (!messageId) return

    // Optimistic update
    setReactions(prev => {
      const existing = prev.find(r => r.emoji === emoji)

      if (existing) {
        if (existing.count <= 1) {
          return prev.filter(r => r.emoji !== emoji)
        }
        return prev.map(r =>
          r.emoji === emoji
            ? { ...r, count: r.count - 1, userReacted: false }
            : r
        )
      }
      return [...prev, { emoji, count: 1, userReacted: true }]
    })

    try {
      const result = await toggleReactionAction(messageId, emoji)
      if (!result.success) {
        // Revert on error
        fetchReactions()
      }
    } catch (err) {
      console.error('Failed to toggle reaction:', err)
      fetchReactions()
    }
  }, [messageId, fetchReactions])

  return { reactions, loading, error, toggleReaction, refetch: fetchReactions }
}
