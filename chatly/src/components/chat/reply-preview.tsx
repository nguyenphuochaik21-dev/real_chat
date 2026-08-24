'use client'

import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { useMessageActionsStore } from '@/stores/message-actions-store'
import type { Tables } from '@/types'

type Message = Tables<'messages'>

// Simple profile type for ReplyPreview (matches Avatar component expectations)
interface ProfilePreview {
  id: string
  display_name: string
  avatar_url: string | null
}

interface ReplyPreviewProps {
  replyingTo: Message | null
  replyingToProfile?: ProfilePreview | null
}

export function ReplyPreview({ replyingTo, replyingToProfile }: ReplyPreviewProps) {
  const { clearReply } = useMessageActionsStore()

  if (!replyingTo) return null

  const displayName = replyingToProfile?.display_name || 'User'
  const avatarUrl = replyingToProfile?.avatar_url || null

  return (
    <div
      className={cn(
        'animate-fade-in flex items-center gap-3 px-3 py-2',
        'border-t border-[var(--border-default)]',
        'bg-[var(--bg-secondary)]'
      )}
    >
      {/* Reply indicator bar */}
      <div className="flex h-8 w-1 rounded-full bg-primary-500" />

      {/* Avatar */}
      <Avatar
        user={{
          id: replyingTo.sender_id || 'unknown',
          display_name: displayName,
          avatar_url: avatarUrl,
        }}
        size="sm"
      />

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <p className="text-xs font-medium text-primary-500">
          {displayName}
        </p>
        <p className="truncate text-sm text-[var(--text-muted)]">
          {replyingTo.content || '[Media]'}
        </p>
      </div>

      {/* Cancel button */}
      <button
        onClick={clearReply}
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-lg',
          'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]',
          'hover:text-[var(--text-primary)] transition-colors'
        )}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
