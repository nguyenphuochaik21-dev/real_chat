'use client'

import { useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  Trash2,
  Ban,
  X,
  BellOff,
  Bell,
  Pin,
  PinOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  archiveConversation,
  deleteConversation,
  clearConversationHistory,
  togglePinned,
  toggleMuted,
} from '@/lib/actions/conversations'
import { useNotificationStore } from '@/stores/notification-store'

interface ConversationActionsProps {
  conversationId: string
  conversationTitle: string
  userId: string
  isPinned: boolean
  isMuted: boolean
  isArchived?: boolean
  onClose: () => void
  onAction?: (updates: Partial<{ is_pinned: boolean; is_muted: boolean; is_archived: boolean }>) => void
}

export function ConversationActions({
  conversationId,
  conversationTitle,
  userId,
  isPinned: initialPinned,
  isMuted: initialMuted,
  isArchived: initialArchived = false,
  onClose,
  onAction,
}: ConversationActionsProps) {
  const [isPinned, setIsPinned] = useState(initialPinned)
  const [isMuted, setIsMuted] = useState(initialMuted)
  const [isArchived, setIsArchived] = useState(initialArchived)
  const [loading, setLoading] = useState<string | null>(null)
  const addToast = useNotificationStore((state) => state.addToast)

  const handlePinned = async () => {
    setLoading('pin')
    try {
      const newValue = !isPinned
      await togglePinned(conversationId, userId, newValue)
      setIsPinned(newValue)
      addToast({
        type: 'system',
        title: newValue ? 'Pinned' : 'Unpinned',
        body: newValue ? 'Conversation pinned' : 'Conversation unpinned',
      })
      onAction?.({ is_pinned: newValue })
    } catch (err) {
      addToast({
        type: 'system',
        title: 'Failed',
        body: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setLoading(null)
    }
  }

  const handleMuted = async () => {
    setLoading('mute')
    try {
      const newValue = !isMuted
      await toggleMuted(conversationId, userId, newValue)
      setIsMuted(newValue)
      addToast({
        type: 'system',
        title: newValue ? 'Muted' : 'Unmuted',
        body: newValue ? 'You won\'t receive notifications' : 'Notifications enabled',
      })
      onAction?.({ is_muted: newValue })
    } catch (err) {
      addToast({
        type: 'system',
        title: 'Failed',
        body: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setLoading(null)
    }
  }

  const handleArchiveToggle = async () => {
    setLoading('archive')
    try {
      const newValue = !isArchived
      if (!newValue && !confirm(`Unarchive this conversation with ${conversationTitle}?`)) {
        setLoading(null)
        return
      }
      if (newValue && !confirm(`Archive this conversation with ${conversationTitle}?`)) {
        setLoading(null)
        return
      }
      await archiveConversation(conversationId, userId, newValue)
      setIsArchived(newValue)
      addToast({
        type: 'system',
        title: newValue ? 'Archived' : 'Unarchived',
        body: newValue ? 'Conversation archived' : 'Conversation restored to active chats',
      })
      onAction?.({ is_archived: newValue })
    } catch (err) {
      addToast({
        type: 'system',
        title: 'Failed',
        body: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setLoading(null)
    }
  }

  const handleClearHistory = async () => {
    if (!confirm(`Clear all your messages in this conversation?`)) return
    setLoading('clear')
    try {
      const result = await clearConversationHistory(conversationId, userId)
      if (result.success) {
        addToast({
          type: 'system',
          title: 'History cleared',
          body: result.deletedCount ? `${result.deletedCount} messages deleted` : 'No messages to delete',
        })
        onAction?.({})
      } else {
        addToast({
          type: 'system',
          title: 'Failed',
          body: result.error || 'Unknown error',
        })
      }
    } catch (err) {
      addToast({
        type: 'system',
        title: 'Failed',
        body: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setLoading(null)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Delete this conversation with ${conversationTitle}? This cannot be undone.`)) return
    setLoading('delete')
    try {
      const result = await deleteConversation(conversationId, userId)
      if (result.success) {
        addToast({
          type: 'system',
          title: 'Deleted',
          body: 'Conversation deleted',
        })
        onAction?.({})
        onClose()
      } else {
        addToast({
          type: 'system',
          title: 'Failed',
          body: result.error || 'Unknown error',
        })
      }
    } catch (err) {
      addToast({
        type: 'system',
        title: 'Failed',
        body: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setLoading(null)
    }
  }

  return (
    <div
      className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] shadow-lg"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3">
        <span className="text-sm font-medium text-[var(--text-primary)]">Actions</span>
        <Button variant="ghost" size="icon-sm" onClick={onClose} className="h-6 w-6">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <Separator />

      {/* Menu items */}
      <div className="p-1">
        {/* Pin/Unpin */}
        <button
          onClick={handlePinned}
          disabled={loading === 'pin'}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-50"
        >
          {isPinned ? (
            <>
              <PinOff className="h-4 w-4 text-[var(--text-muted)]" />
              <span className="text-[var(--text-primary)]">Unpin</span>
            </>
          ) : (
            <>
              <Pin className="h-4 w-4 text-[var(--text-muted)]" />
              <span className="text-[var(--text-primary)]">Pin</span>
            </>
          )}
        </button>

        {/* Mute/Unmute */}
        <button
          onClick={handleMuted}
          disabled={loading === 'mute'}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-50"
        >
          {isMuted ? (
            <>
              <Bell className="h-4 w-4 text-[var(--text-muted)]" />
              <span className="text-[var(--text-primary)]">Unmute</span>
            </>
          ) : (
            <>
              <BellOff className="h-4 w-4 text-[var(--text-muted)]" />
              <span className="text-[var(--text-primary)]">Mute</span>
            </>
          )}
        </button>

        {/* Archive/Unarchive */}
        <button
          onClick={handleArchiveToggle}
          disabled={loading === 'archive'}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-50"
        >
          {isArchived ? (
            <>
              <ArchiveRestore className="h-4 w-4 text-[var(--text-muted)]" />
              <span className="text-[var(--text-primary)]">Unarchive</span>
            </>
          ) : (
            <>
              <Archive className="h-4 w-4 text-[var(--text-muted)]" />
              <span className="text-[var(--text-primary)]">Archive</span>
            </>
          )}
        </button>

        <Separator className="my-1" />

        {/* Clear History */}
        <button
          onClick={handleClearHistory}
          disabled={loading === 'clear'}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4 text-[var(--text-muted)]" />
          <span className="text-[var(--text-primary)]">Clear history</span>
        </button>

        {/* Delete */}
        <button
          onClick={handleDelete}
          disabled={loading === 'delete'}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
          <span>Delete conversation</span>
        </button>
      </div>
    </div>
  )
}
