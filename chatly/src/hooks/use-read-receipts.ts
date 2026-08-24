'use client'

import { useEffect, useCallback, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/types'

type Message = Tables<'messages'>

// Track which messages the current user has read (by other users)
export function useReadReceipts(conversationId: string | null, currentUserId: string | null) {
  const supabase = createClient()

  // Mark messages as read when opening a conversation
  const markAsRead = useCallback(async () => {
    if (!conversationId || !currentUserId) return

    try {
      // Update last_read_at for current user
      await supabase
        .from('conversation_participants')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('user_id', currentUserId)

      // Get unread messages from other users
      const { data: unreadMessages } = await supabase
        .from('messages')
        .select('id, sender_id')
        .eq('conversation_id', conversationId)
        .neq('sender_id', currentUserId)
        .neq('status', 'read')

      if (unreadMessages && unreadMessages.length > 0) {
        // Mark them as read - the postgres_changes subscription will notify the sender
        await supabase
          .from('messages')
          .update({ status: 'read' })
          .in('id', unreadMessages.map(m => m.id))
      }
    } catch (err) {
      console.error('Failed to mark as read:', err)
    }
  }, [conversationId, currentUserId, supabase])

  return { markAsRead }
}

// Hook to track message delivery/read status for display
export function useMessageReadStatus(conversationId: string | null) {
  const [readByMap, setReadByMap] = useState<Map<string, string[]>>(new Map())
  const [statusMap, setStatusMap] = useState<Map<string, string>>(new Map())
  const supabase = createClient()
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)

  useEffect(() => {
    if (!conversationId) return

    // Clean up previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }

    const channel = supabase
      .channel(`read-status-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as Message
          const old = payload.old as Message | undefined

          // Update status map
          setStatusMap(prev => {
            const next = new Map(prev)
            next.set(updated.id, updated.status || 'sent')
            return next
          })

          // Track read status
          if (updated.status === 'read' && old?.status !== 'read') {
            setReadByMap(prev => {
              const next = new Map(prev)
              const current = next.get(updated.id) || []
              if (!current.includes(updated.sender_id || '')) {
                next.set(updated.id, [...current, updated.sender_id || ''])
              }
              return next
            })
          }
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [conversationId, supabase])

  const getMessageStatus = useCallback((messageId: string): string => {
    return statusMap.get(messageId) || 'sent'
  }, [statusMap])

  const getReadBy = useCallback((messageId: string): string[] => {
    return readByMap.get(messageId) || []
  }, [readByMap])

  return { readByMap, getReadBy, getMessageStatus }
}

// Subscribe to message status changes globally (for read receipts from other conversations)
export function useGlobalMessageStatusUpdates(currentUserId: string | null) {
  const [messageStatuses, setMessageStatuses] = useState<Map<string, string>>(new Map())
  const supabase = createClient()

  useEffect(() => {
    if (!currentUserId) return

    // Subscribe to messages where current user is the sender
    const channel = supabase
      .channel('global-message-status')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=eq.${currentUserId}`,
        },
        (payload) => {
          const updated = payload.new as Message
          setMessageStatuses(prev => {
            const next = new Map(prev)
            next.set(updated.id, updated.status || 'sent')
            return next
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentUserId, supabase])

  const getStatus = useCallback((messageId: string): string | undefined => {
    return messageStatuses.get(messageId)
  }, [messageStatuses])

  return { messageStatuses, getStatus }
}
