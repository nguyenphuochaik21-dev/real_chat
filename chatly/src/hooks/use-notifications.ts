'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useNotificationStore } from '@/stores/notification-store'

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

          // Skip if user is blocked by this sender OR has blocked this sender
          // (we'll check both directions to be safe)
          const { data: blockCheck } = await supabase
            .from('user_blocks')
            .select('id')
            .or(`and(blocker_id.eq.${userId},blocked_id.eq.${newMessage.sender_id}),and(blocker_id.eq.${newMessage.sender_id},blocked_id.eq.${userId})`)
            .limit(1)

          if (blockCheck && blockCheck.length > 0) return

          // Check conversation participation flags (muted / archived)
          const { data: participation } = await supabase
            .from('conversation_participants')
            .select('is_muted, is_archived')
            .eq('conversation_id', newMessage.conversation_id)
            .eq('user_id', userId)
            .single()

          // Skip if conversation is archived or muted
          if (participation?.is_archived || participation?.is_muted) return

          // Fetch sender info
          const { data: sender } = await supabase
            .from('profiles')
            .select('display_name, avatar_url')
            .eq('id', newMessage.sender_id)
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
