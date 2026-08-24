'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useNotificationStore, type NotificationType } from '@/stores/notification-store'

interface UseNotificationsOptions {
  userId: string | null
  currentConversationId?: string | null
  enabled?: boolean
}

export function useNotifications({
  userId,
  currentConversationId,
  enabled = true,
}: UseNotificationsOptions) {
  const store = useNotificationStore()
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (!enabled || !userId) return

    // Subscribe to new messages from OTHER conversations
    channelRef.current = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const newMessage = payload.new as {
            id: string
            sender_id: string
            conversation_id: string
            content: string
            created_at: string
          }

          // Skip if message is from current user
          if (newMessage.sender_id === userId) return

          // Skip if we're currently viewing this conversation
          if (currentConversationId === newMessage.conversation_id) return

          // Fetch sender info
          const { data: sender } = await supabase
            .from('profiles')
            .select('display_name, avatar_url')
            .eq('id', newMessage.sender_id)
            .single()

          // Fetch conversation name
          const { data: conversation } = await supabase
            .from('conversations')
            .select('name')
            .eq('id', newMessage.conversation_id)
            .single()

          // Add notification
          store.addNotification({
            type: 'message',
            title: sender?.display_name || 'New message',
            body: newMessage.content.slice(0, 100) + (newMessage.content.length > 100 ? '...' : ''),
            conversationId: newMessage.conversation_id,
            senderId: newMessage.sender_id,
            senderName: sender?.display_name,
            senderAvatar: sender?.avatar_url,
          })
        }
      )
      .subscribe()

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [userId, currentConversationId, enabled, store, supabase])

  // Load existing notifications from database (future: when we persist notifications)
  const loadNotifications = async () => {
    // TODO: Load from database when we add notifications table
  }

  return {
    notifications: store.notifications,
    unreadCount: store.unreadCount,
    toasts: store.toasts,
    isOpen: store.isOpen,
    markAsRead: store.markAsRead,
    markAllAsRead: store.markAllAsRead,
    removeNotification: store.removeNotification,
    clearAll: store.clearAll,
    setIsOpen: store.setIsOpen,
    removeToast: store.removeToast,
    addNotification: store.addNotification,
  }
}

// Helper to trigger notification for testing
export function notifyNewMessage(
  store: ReturnType<typeof useNotificationStore.getState>,
  data: {
    conversationId: string
    senderId: string
    senderName: string
    senderAvatar?: string | null
    content: string
  }
) {
  store.addNotification({
    type: 'message',
    title: data.senderName,
    body: data.content.slice(0, 100) + (data.content.length > 100 ? '...' : ''),
    conversationId: data.conversationId,
    senderId: data.senderId,
    senderName: data.senderName,
    senderAvatar: data.senderAvatar,
  })
}
