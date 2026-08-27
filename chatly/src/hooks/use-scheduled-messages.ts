'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  createScheduledMessage,
  cancelScheduledMessage,
  getScheduledMessages,
  sendScheduledMessageNow,
  type ScheduledMessageWithConversation,
} from '@/lib/actions/scheduled-messages'

// Singleton supabase client - only one instance
const supabase = createClient()

interface UseScheduledMessages {
  scheduledMessages: ScheduledMessageWithConversation[]
  loading: boolean
  error: string | null
  createSchedule: (
    conversationId: string,
    content: string,
    scheduledAt: Date,
    options?: {
      contentType?: string
      mediaUrl?: string | null
      replyTo?: string | null
    }
  ) => Promise<{ success: boolean; error?: string }>
  cancelSchedule: (messageId: string) => Promise<{ success: boolean; error?: string }>
  sendNow: (messageId: string) => Promise<{ success: boolean; error?: string }>
  refetch: () => void
}

export function useScheduledMessages(userId: string | null): UseScheduledMessages {
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessageWithConversation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Ref for stable callback reference
  const setScheduledMessagesRef = useRef(setScheduledMessages)
  setScheduledMessagesRef.current = setScheduledMessages

  const fetchScheduledMessages = useCallback(async () => {
    if (!userId) {
      setScheduledMessages([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await getScheduledMessages()
      if (result.success && result.messages) {
        setScheduledMessages(result.messages)
      } else {
        setError(result.error || 'Failed to fetch scheduled messages')
      }
    } catch (err) {
      console.error('Failed to fetch scheduled messages:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [userId])

  // Initial fetch
  useEffect(() => {
    if (userId) {
      fetchScheduledMessages()
    }
  }, [userId, fetchScheduledMessages])

  // Subscribe to scheduled message changes - only once
  const channelSubscribed = useRef(false)

  useEffect(() => {
    if (!userId || channelSubscribed.current) return

    const channel = supabase
      .channel(`scheduled-messages-global-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scheduled_messages',
        },
        () => {
          fetchScheduledMessages()
        }
      )

    channel.subscribe()
    channelSubscribed.current = true

    return () => {
      channelSubscribed.current = false
      supabase.removeChannel(channel)
    }
  }, [userId])

  const createSchedule = useCallback(async (
    conversationId: string,
    content: string,
    scheduledAt: Date,
    options?: {
      contentType?: string
      mediaUrl?: string | null
      replyTo?: string | null
    }
  ) => {
    try {
      const result = await createScheduledMessage({
        conversationId,
        content,
        scheduledAt,
        contentType: options?.contentType,
        mediaUrl: options?.mediaUrl,
        replyTo: options?.replyTo,
      })

      if (result.success) {
        fetchScheduledMessages()
        return { success: true }
      } else {
        return { success: false, error: result.error }
      }
    } catch (err) {
      console.error('Failed to create scheduled message:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }, [fetchScheduledMessages])

  const cancelSchedule = useCallback(async (messageId: string) => {
    try {
      const result = await cancelScheduledMessage(messageId)

      if (result.success) {
        setScheduledMessages(prev => prev.filter(m => m.id !== messageId))
        return { success: true }
      } else {
        return { success: false, error: result.error }
      }
    } catch (err) {
      console.error('Failed to cancel scheduled message:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }, [])

  const sendNow = useCallback(async (messageId: string) => {
    try {
      const result = await sendScheduledMessageNow(messageId)

      if (result.success) {
        setScheduledMessages(prev => prev.filter(m => m.id !== messageId))
        return { success: true }
      } else {
        return { success: false, error: result.error }
      }
    } catch (err) {
      console.error('Failed to send scheduled message now:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }, [])

  return {
    scheduledMessages,
    loading,
    error,
    createSchedule,
    cancelSchedule,
    sendNow,
    refetch: fetchScheduledMessages,
  }
}