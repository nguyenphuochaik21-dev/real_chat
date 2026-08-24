'use client'

import { MessageSquare, Phone, AtSign, Info, Check, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { type Notification, type NotificationType } from '@/stores/notification-store'
import { formatDistanceToNow } from '@/lib/utils'

const iconMap: Record<NotificationType, typeof MessageSquare> = {
  message: MessageSquare,
  call: Phone,
  mention: AtSign,
  system: Info,
}

interface NotificationItemProps {
  notification: Notification
  onMarkAsRead?: (id: string) => void
  onRemove?: (id: string) => void
  onClick?: (notification: Notification) => void
}

export function NotificationItem({
  notification,
  onMarkAsRead,
  onRemove,
  onClick,
}: NotificationItemProps) {
  const Icon = iconMap[notification.type]

  const handleClick = () => {
    if (!notification.read && onMarkAsRead) {
      onMarkAsRead(notification.id)
    }
    if (onClick) {
      onClick(notification)
    }
  }

  return (
    <div
      className={cn(
        'group flex items-start gap-3 px-4 py-3 transition-colors',
        'hover:bg-[var(--bg-hover)] cursor-pointer',
        !notification.read && 'bg-[var(--bg-secondary)]'
      )}
      onClick={handleClick}
    >
      {/* Avatar or Icon */}
      <div className="relative flex-shrink-0">
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
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-secondary)]">
            <Icon className="h-5 w-5 text-[var(--text-muted)]" />
          </div>
        )}

        {/* Unread dot */}
        {!notification.read && (
          <span className="bg-primary-500 absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-[var(--bg-primary)]" />
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <p className={cn(
            'text-sm truncate',
            notification.read ? 'text-[var(--text-secondary)]' : 'font-medium text-[var(--text-primary)]'
          )}>
            {notification.title}
          </p>
          <span className="flex-shrink-0 text-xs text-[var(--text-muted)]">
            {formatDistanceToNow(new Date(notification.createdAt))}
          </span>
        </div>
        <p className="text-xs text-[var(--text-muted)] line-clamp-2">
          {notification.body}
        </p>
      </div>

      {/* Actions (show on hover) */}
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {!notification.read && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onMarkAsRead?.(notification.id)
            }}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
            title="Mark as read"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove?.(notification.id)
          }}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-red-500"
          title="Remove"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
