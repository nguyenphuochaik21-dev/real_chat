'use client'

import { X, Bell, Trash2, CheckCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNotificationStore } from '@/stores/notification-store'
import { NotificationItem } from './notification-item'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

interface NotificationCenterProps {
  isOpen: boolean
  onClose: () => void
}

export function NotificationCenter({ isOpen, onClose }: NotificationCenterProps) {
  const router = useRouter()
  const notifications = useNotificationStore((state) => state.notifications)
  const markAsRead = useNotificationStore((state) => state.markAsRead)
  const removeNotification = useNotificationStore((state) => state.removeNotification)
  const clearAll = useNotificationStore((state) => state.clearAll)

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
    }
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  const handleNotificationClick = (notification: typeof notifications[0]) => {
    if (notification.conversationId) {
      router.push(`/chats/${notification.conversationId}`)
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="bg-primary fixed top-0 right-0 z-50 flex h-full w-96 flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-default)] px-4 py-4">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary-500" />
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Notifications</h2>
          </div>
          <div className="flex items-center gap-2">
            {notifications.length > 0 && (
              <>
                <button
                  onClick={clearAll}
                  className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                  title="Clear all"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear
                </button>
                <div className="h-4 w-px bg-[var(--border-default)]" />
              </>
            )}
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--bg-secondary)]">
                <Bell className="h-8 w-8 text-[var(--text-muted)]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--text-secondary)]">No notifications yet</p>
                <p className="text-xs text-[var(--text-muted)]">
                  You'll see notifications when someone messages you
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-default)]">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={markAsRead}
                  onRemove={removeNotification}
                  onClick={handleNotificationClick}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
