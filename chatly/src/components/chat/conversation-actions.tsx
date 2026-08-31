'use client'

import { useState, useEffect } from 'react'
import {
  Archive,
  ArchiveRestore,
  Trash2,
  X,
  BellOff,
  Bell,
  Pin,
  PinOff,
  Tag,
  ImageIcon,
  Search,
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
import { useConversationLabels } from '@/hooks/use-conversation-labels'
import { LabelManager } from './label-manager'
import { useI18n } from '@/lib/i18n'

interface ConversationActionsProps {
  conversationId: string
  conversationTitle: string
  userId: string
  isPinned: boolean
  isMuted: boolean
  isArchived?: boolean
  onClose: () => void
  onSearch?: () => void
  onOpenMedia?: () => void
  onAction?: (
    updates: Partial<{ is_pinned: boolean; is_muted: boolean; is_archived: boolean }>
  ) => void
}

export function ConversationActions({
  conversationId,
  conversationTitle,
  userId,
  isPinned: initialPinned,
  isMuted: initialMuted,
  isArchived: initialArchived = false,
  onClose,
  onSearch,
  onOpenMedia,
  onAction,
}: ConversationActionsProps) {
  const { t } = useI18n()
  const [isPinned, setIsPinned] = useState(initialPinned)
  const [isMuted, setIsMuted] = useState(initialMuted)
  const [isArchived, setIsArchived] = useState(initialArchived)
  const [loading, setLoading] = useState<string | null>(null)
  const addToast = useNotificationStore((state) => state.addToast)

  // Labels
  const [showLabelManager, setShowLabelManager] = useState(false)
  const {
    labels,
    conversationLabels,
    createLabel,
    deleteLabel,
    assignLabel,
    removeLabel,
    loadLabelsForConversations,
  } = useConversationLabels()

  // Load labels for this conversation on mount
  useEffect(() => {
    loadLabelsForConversations([conversationId])
  }, [conversationId, loadLabelsForConversations])

  const currentLabels = conversationLabels.get(conversationId) || []

  const handlePinned = async () => {
    setLoading('pin')
    try {
      const newValue = !isPinned
      await togglePinned(conversationId, userId, newValue)
      setIsPinned(newValue)
      addToast({
        type: 'system',
        title: newValue ? t('actions.pinned') : t('actions.unpinned'),
        body: newValue ? t('actions.pinnedBody') : t('actions.unpinnedBody'),
      })
      onAction?.({ is_pinned: newValue })
    } catch (err) {
      addToast({
        type: 'system',
        title: t('common.failed'),
        body: err instanceof Error ? err.message : t('common.unknownError'),
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
        title: newValue ? t('actions.muted') : t('actions.unmuted'),
        body: newValue ? t('actions.mutedBody') : t('actions.unmutedBody'),
      })
      onAction?.({ is_muted: newValue })
    } catch (err) {
      addToast({
        type: 'system',
        title: t('common.failed'),
        body: err instanceof Error ? err.message : t('common.unknownError'),
      })
    } finally {
      setLoading(null)
    }
  }

  const handleArchiveToggle = async () => {
    setLoading('archive')
    try {
      const newValue = !isArchived
      if (!newValue && !confirm(t('actions.unarchiveConfirm', { name: conversationTitle }))) {
        setLoading(null)
        return
      }
      if (newValue && !confirm(t('actions.archiveConfirm', { name: conversationTitle }))) {
        setLoading(null)
        return
      }
      await archiveConversation(conversationId, userId, newValue)
      setIsArchived(newValue)
      addToast({
        type: 'system',
        title: newValue ? t('actions.archived') : t('actions.unarchived'),
        body: newValue ? t('actions.archivedBody') : t('actions.unarchivedBody'),
      })
      onAction?.({ is_archived: newValue })
    } catch (err) {
      addToast({
        type: 'system',
        title: t('common.failed'),
        body: err instanceof Error ? err.message : t('common.unknownError'),
      })
    } finally {
      setLoading(null)
    }
  }

  const handleClearHistory = async () => {
    if (!confirm(t('actions.clearConfirm'))) return
    setLoading('clear')
    try {
      const result = await clearConversationHistory(conversationId, userId)
      if (result.success) {
        addToast({
          type: 'system',
          title: t('actions.historyCleared'),
          body: result.deletedCount
            ? t('actions.messagesDeleted', { count: result.deletedCount })
            : t('actions.noMessagesToDelete'),
        })
        onAction?.({})
      } else {
        addToast({
          type: 'system',
          title: t('common.failed'),
          body: result.error || t('common.unknownError'),
        })
      }
    } catch (err) {
      addToast({
        type: 'system',
        title: t('common.failed'),
        body: err instanceof Error ? err.message : t('common.unknownError'),
      })
    } finally {
      setLoading(null)
    }
  }

  const handleDelete = async () => {
    if (!confirm(t('actions.deleteConfirm', { name: conversationTitle }))) return
    setLoading('delete')
    try {
      const result = await deleteConversation(conversationId, userId)
      if (result.success) {
        addToast({
          type: 'system',
          title: t('actions.deleted'),
          body: t('actions.deletedBody'),
        })
        onAction?.({})
        onClose()
      } else {
        addToast({
          type: 'system',
          title: t('common.failed'),
          body: result.error || t('common.unknownError'),
        })
      }
    } catch (err) {
      addToast({
        type: 'system',
        title: t('common.failed'),
        body: err instanceof Error ? err.message : t('common.unknownError'),
      })
    } finally {
      setLoading(null)
    }
  }

  return (
    <>
      <div
        className="absolute top-full right-0 z-50 mt-1 w-56 rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3">
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {t('actions.title')}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={onClose} className="h-6 w-6">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <Separator />

        {/* Menu items */}
        <div className="p-1">
          {onSearch && (
            <button
              onClick={() => {
                onClose()
                onSearch()
              }}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-[var(--bg-hover)]"
            >
              <Search className="h-4 w-4 text-[var(--text-muted)]" />
              <span className="text-[var(--text-primary)]">{t('actions.search')}</span>
            </button>
          )}

          {onOpenMedia && (
            <button
              onClick={() => {
                onClose()
                onOpenMedia()
              }}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-[var(--bg-hover)]"
            >
              <ImageIcon className="h-4 w-4 text-[var(--text-muted)]" />
              <span className="text-[var(--text-primary)]">{t('actions.media')}</span>
            </button>
          )}

          {(onSearch || onOpenMedia) && <Separator className="my-1" />}

          {/* Pin/Unpin */}
          <button
            onClick={handlePinned}
            disabled={loading === 'pin'}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-50"
          >
            {isPinned ? (
              <>
                <PinOff className="h-4 w-4 text-[var(--text-muted)]" />
                <span className="text-[var(--text-primary)]">{t('actions.unpin')}</span>
              </>
            ) : (
              <>
                <Pin className="h-4 w-4 text-[var(--text-muted)]" />
                <span className="text-[var(--text-primary)]">{t('actions.pin')}</span>
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
                <span className="text-[var(--text-primary)]">{t('actions.unmute')}</span>
              </>
            ) : (
              <>
                <BellOff className="h-4 w-4 text-[var(--text-muted)]" />
                <span className="text-[var(--text-primary)]">{t('actions.mute')}</span>
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
                <span className="text-[var(--text-primary)]">{t('actions.unarchive')}</span>
              </>
            ) : (
              <>
                <Archive className="h-4 w-4 text-[var(--text-muted)]" />
                <span className="text-[var(--text-primary)]">{t('actions.archive')}</span>
              </>
            )}
          </button>

          {/* Labels */}
          <button
            onClick={() => setShowLabelManager(true)}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-[var(--bg-hover)]"
          >
            <Tag className="h-4 w-4 text-[var(--text-muted)]" />
            <span className="flex-1 text-left text-[var(--text-primary)]">
              {t('actions.labels')}
            </span>
            {currentLabels.length > 0 && (
              <div className="flex gap-1">
                {currentLabels.slice(0, 3).map((label) => (
                  <div
                    key={label.id}
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: label.color || '#8B5CF6' }}
                  />
                ))}
              </div>
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
            <span className="text-[var(--text-primary)]">{t('actions.clearHistory')}</span>
          </button>

          {/* Delete */}
          <button
            onClick={handleDelete}
            disabled={loading === 'delete'}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            <span>{t('actions.deleteConversation')}</span>
          </button>
        </div>
      </div>

      {/* Label Manager Modal */}
      <LabelManager
        isOpen={showLabelManager}
        onClose={() => setShowLabelManager(false)}
        conversationId={conversationId}
        currentLabels={currentLabels}
        allLabels={labels}
        onAssignLabel={async (labelId) => {
          await assignLabel(conversationId, labelId)
        }}
        onRemoveLabel={async (labelId) => {
          await removeLabel(conversationId, labelId)
        }}
        onCreateLabel={async (name, color) => {
          const result = await createLabel(name, color)
          return result
        }}
        onDeleteLabel={async (labelId) => {
          await deleteLabel(labelId)
        }}
      />
    </>
  )
}
