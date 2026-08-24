'use client'

import { useEffect, useState } from 'react'
import { X, MessageSquare, Phone, AtSign, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { useNotificationStore, type Notification, type NotificationType } from '@/stores/notification-store'
import { useRouter } from 'next/navigation'

const iconMap: Record<NotificationType, typeof MessageSquare> = {
  message: MessageSquare,
  call: Phone,
  mention: AtSign,
  system: Info,
}

function ToastItem({ notification }: { notification: Notification }) {
  const router = useRouter()
  const removeToast = useNotificationStore((state) => state.removeToast)
  const [isVisible, setIsVisible] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)

  useEffect(() => {
    // Trigger entrance animation
    requestAnimationFrame(() => setIsVisible(true))
  }, [])

  const handleClose = () => {
    setIsLeaving(true)
    setTimeout(() => removeToast(notification.id), 200)
  }

  const handleClick = () => {
    if (notification.conversationId) {
      router.push(`/chats/${notification.conversationId}`)
      handleClose()
    }
  }

  const Icon = iconMap[notification.type]

  return (
    <div
      className={cn(
        'pointer-events-auto flex w-80 items-start gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-primary)] p-3 shadow-lg transition-all duration-200',
        isVisible && !isLeaving
          ? 'translate-x-0 opacity-100'
          : 'translate-x-full opacity-0'
      )}
    >
      {/* Avatar */}
      <div className="flex-shrink-0">
        {notification.senderAvatar || notification.senderName ? (
          <Avatar
            user={{
              id: notification.senderId || 'unknown',
              display_name: notification.senderName || 'User',
              avatar_url: notification.senderAvatar || null,
            }}
            size="sm"
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-secondary)]">
            <Icon className="h-4 w-4 text-[var(--text-muted)]" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
        <p className="text-sm font-medium text-[var(--text-primary)] truncate">
          {notification.title}
        </p>
        <p className="text-xs text-[var(--text-muted)] truncate">
          {notification.body}
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-shrink-0 items-center gap-1">
        {notification.conversationId && (
          <button
            onClick={handleClick}
            className="text-xs text-primary-500 hover:underline"
          >
            View
          </button>
        )}
        <button
          onClick={handleClose}
          className="flex h-6 w-6 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

export function NotificationToastContainer() {
  const toasts = useNotificationStore((state) => state.toasts)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.slice(-3).map((toast) => (
        <ToastItem key={toast.id} notification={toast} />
      ))}
    </div>
  )
}
