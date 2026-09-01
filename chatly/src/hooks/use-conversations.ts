'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { parseConversationSummaries, type ConversationSummary } from '@/lib/conversation-summary'

export type ConversationWithDetails = ConversationSummary

export function useConversations(userId: string | null) {
  const [conversations, setConversations] = useState<ConversationWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const fetchConversations = useCallback(async () => {
    if (!userId) {
      setConversations([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data, error: summariesError } = await supabase.rpc('get_conversation_summaries')
      if (summariesError) throw summariesError
      setConversations(
        parseConversationSummaries(data).filter((conversation) => !conversation.is_archived)
      )
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Failed to fetch conversations')
    } finally {
      setLoading(false)
    }
  }, [userId, supabase])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void fetchConversations(), 0)
    if (!userId) return () => window.clearTimeout(timeoutId)

    const channel = supabase
      .channel(`conversation-summaries-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_participants',
          filter: `user_id=eq.${userId}`,
        },
        () => void fetchConversations()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => void fetchConversations()
      )
      .subscribe()

    return () => {
      window.clearTimeout(timeoutId)
      void supabase.removeChannel(channel)
    }
  }, [userId, fetchConversations, supabase])

  return { conversations, loading, error, refetch: fetchConversations }
}
