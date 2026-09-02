'use client'

import { useEffect, useRef } from 'react'
import { Reply, Pencil, Trash2, Share2, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMessageActionsStore } from '@/stores/message-actions-store'
import type { Tables } from '@/types'
import { useI18n } from '@/lib/i18n'

type Message = Tables<'messages'>

interface MessageContextMenuProps {
  currentUserId: string
  onEdit?: (message: Message) => void
  onDelete?: (message: Message) => void
}

export function MessageContextMenu({ currentUserId, onEdit, onDelete }: MessageContextMenuProps) {
  const { t } = useI18n()
  const menuRef = useRef<HTMLDivElement>(null)
  const {
    contextMenuOpen,
    contextMenuPosition,
    contextMenuTarget,
    closeContextMenu,
    setReplyTo,
    openForwardModal,
  } = useMessageActionsStore()

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeContextMenu()
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeContextMenu()
    }

    if (contextMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [contextMenuOpen, closeContextMenu])

  if (!contextMenuOpen || !contextMenuTarget) return null

  const isOwnMessage = contextMenuTarget.sender_id === currentUserId
  const isDeleted = !!contextMenuTarget.deleted_at

  // Check if message is within edit window (15 minutes)
  const createdAt = new Date(contextMenuTarget.created_at || '')
  // The edit action is time-sensitive, so it must be evaluated when the menu renders.
  // eslint-disable-next-line react-hooks/purity
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000)
  const withinEditWindow = createdAt > fifteenMinutesAgo

  const handleReply = () => {
    setReplyTo(contextMenuTarget)
    closeContextMenu()
  }

  const handleEdit = () => {
    if (onEdit) onEdit(contextMenuTarget)
    closeContextMenu()
  }

  const handleDelete = () => {
    if (onDelete) onDelete(contextMenuTarget)
    closeContextMenu()
  }

  const handleForward = () => {
    openForwardModal([contextMenuTarget])
    closeContextMenu()
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(contextMenuTarget.content || '')
    closeContextMenu()
  }

  return (
    <>
      {/* Backdrop for mobile */}
      <div className="fixed inset-0 z-40 md:hidden" onClick={closeContextMenu} />

      {/* Menu */}
      <div
        ref={menuRef}
        className={cn(
          'fixed z-50 w-56 overflow-hidden rounded-xl border border-[var(--border-default)]',
          'animate-fade-in bg-[var(--bg-panel)] shadow-xl'
        )}
        style={{
          left: Math.min(
            contextMenuPosition.x,
            typeof window !== 'undefined' ? window.innerWidth - 240 : contextMenuPosition.x
          ),
          top: Math.min(
            contextMenuPosition.y,
            typeof window !== 'undefined' ? window.innerHeight - 320 : contextMenuPosition.y
          ),
        }}
      >
        <div className="py-1">
          {/* Reply */}
          <MenuItem icon={Reply} label={t('message.reply')} onClick={handleReply} />

          {/* Copy */}
          <MenuItem
            icon={Copy}
            label={t('message.copy')}
            onClick={handleCopy}
            disabled={isDeleted}
          />

          {/* Forward */}
          <MenuItem
            icon={Share2}
            label={t('message.forward')}
            onClick={handleForward}
            disabled={isDeleted}
          />

          <div className="my-1 h-px bg-[var(--border-default)]" />

          {/* Edit (own messages only, within 15 min) */}
          {isOwnMessage && !isDeleted && withinEditWindow && (
            <MenuItem icon={Pencil} label={t('message.edit')} onClick={handleEdit} />
          )}

          {/* Delete (own messages only) */}
          {isOwnMessage && !isDeleted && (
            <>
              <div className="my-1 h-px bg-[var(--border-default)]" />
              <MenuItem
                icon={Trash2}
                label={t('message.delete')}
                onClick={handleDelete}
                className="text-red-500 hover:bg-red-500/10"
              />
            </>
          )}
        </div>
      </div>
    </>
  )
}

interface MenuItemProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  disabled?: boolean
  className?: string
}

function MenuItem({ icon: Icon, label, onClick, disabled, className }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-3 px-3 py-2 text-left text-sm',
        'transition-colors hover:bg-[var(--bg-hover)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
    >
      <Icon className="h-4 w-4 text-[var(--text-muted)]" />
      <span>{label}</span>
    </button>
  )
}
