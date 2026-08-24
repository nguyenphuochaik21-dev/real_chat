'use client'

import { Bell } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useNotificationStore } from '@/stores/notification-store'

interface NotificationBellProps {
  onClick?: () => void
}

export function NotificationBell({ onClick }: NotificationBellProps) {
  const unreadCount = useNotificationStore((state) => state.unreadCount)
  const isOpen = useNotificationStore((state) => state.isOpen)

  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors',
        isOpen
          ? 'bg-[var(--bg-active)] text-primary-500'
          : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
      )}
      title="Notifications"
    >
      <Bell className="h-5 w-5" />

      {/* Unread badge */}
      {unreadCount > 0 && (
        <span className="bg-primary-500 absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-medium text-white animate-in fade-in zoom-in duration-200">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  )
}
