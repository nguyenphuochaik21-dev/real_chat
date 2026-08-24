'use client'

import { useState, useEffect } from 'react'
import { NotificationBell, NotificationToastContainer, NotificationCenter } from '@/components/notifications'
import { useNotifications } from '@/hooks/use-notifications'
import { useParams } from 'next/navigation'

interface NotificationProviderProps {
  userId: string | null
  children: React.ReactNode
}

export function NotificationProvider({ userId, children }: NotificationProviderProps) {
  const [isOpen, setIsOpen] = useState(false)
  const params = useParams()
  const currentConversationId = params?.id as string | undefined

  // Current conversation ID from URL
  const conversationId = typeof window !== 'undefined'
    ? window.location.pathname.match(/\/chats\/([^/]+)/)?.[1]
    : undefined

  const {
    unreadCount,
    notifications,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll,
    setIsOpen: setStoreIsOpen,
  } = useNotifications({
    userId,
    currentConversationId: conversationId,
    enabled: !!userId,
  })

  const toggleOpen = () => {
    setIsOpen(!isOpen)
    setStoreIsOpen(!isOpen)
  }

  return (
    <>
      {/* Bell button - rendered outside so it can be placed anywhere */}
      <NotificationBell onClick={toggleOpen} />

      {/* Toast container */}
      <NotificationToastContainer />

      {/* Notification center panel */}
      <NotificationCenter
        isOpen={isOpen}
        onClose={() => {
          setIsOpen(false)
          setStoreIsOpen(false)
        }}
      />

      {/* Pass notifications context to children */}
      {children}
    </>
  )
}

// Hook to access notification actions from anywhere
export { useNotifications } from '@/hooks/use-notifications'
