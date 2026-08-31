'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/types'

export type Profile = Tables<'profiles'>
export type Message = Tables<'messages'>
export type Conversation = Tables<'conversations'>
export type Participant = Tables<'conversation_participants'>

export interface ConversationWithDetails extends Conversation {
  participant: Profile
  last_message: Message | null
  unread_count: number
  is_pinned: boolean
  is_muted: boolean
}

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
      // Get all conversations for this user
      const { data: participations, error: partError } = await supabase
        .from('conversation_participants')
        .select(
          `
          *,
          conversation:conversations(
            *,
            messages(
              id,
              content,
              sender_id,
              created_at,
              status
            )
          )
        `
        )
        .eq('user_id', userId)
        .order('last_read_at', { ascending: false })

      if (partError) throw partError

      // Transform and get other participant's profile for each conversation
      const conversationsWithParticipants: ConversationWithDetails[] = []

      for (const part of participations || []) {
        const conv = part.conversation
        if (!conv) continue

        // Get the other participant(s) in this conversation
        const { data: otherParticipants } = await supabase
          .from('conversation_participants')
          .select('user_id')
          .eq('conversation_id', conv.id)
          .neq('user_id', userId)

        const otherUserId = otherParticipants?.[0]?.user_id

        let participant = null
        if (otherUserId) {
          const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', otherUserId)
            .single()
          participant = data
        }

        // Get last message and unread count
        const { data: lastMessage } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        // Count unread messages
        const { count: unreadCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .neq('sender_id', userId)
          .gt('created_at', part.last_read_at || '1970-01-01')

        if (participant && lastMessage) {
          conversationsWithParticipants.push({
            ...conv,
            participant,
            last_message: lastMessage,
            unread_count: unreadCount || 0,
            is_pinned: part.is_pinned,
            is_muted: part.is_muted,
          })
        }
      }

      // Sort: pinned first, then by last message time
      const sorted = conversationsWithParticipants.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1
        if (!a.is_pinned && b.is_pinned) return 1
        const dateA = a.last_message?.created_at ? new Date(a.last_message.created_at).getTime() : 0
        const dateB = b.last_message?.created_at ? new Date(b.last_message.created_at).getTime() : 0
        return dateB - dateA
      })

      setConversations(sorted)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch conversations')
    } finally {
      setLoading(false)
    }
  }, [userId, supabase])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void fetchConversations(), 0)

    // Subscribe to real-time changes
    if (!userId) return () => window.clearTimeout(timeoutId)

    const channel = supabase
      .channel('conversations-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_participants',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchConversations()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        () => {
          fetchConversations()
        }
      )
      .subscribe()

    return () => {
      window.clearTimeout(timeoutId)
      supabase.removeChannel(channel)
    }
  }, [userId, fetchConversations, supabase])

  return { conversations, loading, error, refetch: fetchConversations }
}
