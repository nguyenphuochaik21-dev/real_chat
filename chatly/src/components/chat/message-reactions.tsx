'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Smile } from 'lucide-react'
import { EmojiPicker } from './emoji-picker'
import type { MessageReaction } from '@/lib/actions/messages'

interface MessageReactionsProps {
  reactions: MessageReaction[]
  onToggleReaction: (emoji: string) => void
  showAddButton?: boolean
}

export function MessageReactions({
  reactions,
  onToggleReaction,
  showAddButton = true,
}: MessageReactionsProps) {
  const [showPicker, setShowPicker] = useState(false)

  // Don't render if no reactions AND add button is hidden AND picker is closed
  if (reactions.length === 0 && !showAddButton && !showPicker) return null

  return (
    <div className="absolute right-1 bottom-0 z-10 flex translate-y-1/2 items-center gap-1">
      {/* Existing reactions */}
      {reactions.length > 0 && (
        <div className="flex items-center gap-0.5 rounded-full border border-[var(--border-default)] bg-[var(--bg-panel)] p-0.5 shadow-sm">
          {reactions.map((reaction) => (
            <button
              key={reaction.emoji}
              onClick={() => onToggleReaction(reaction.emoji)}
              className={cn(
                'flex h-6 items-center gap-0.5 rounded-full px-1.5 text-sm transition-all',
                'hover:scale-105 active:scale-95',
                reaction.userReacted && 'bg-primary-500/15'
              )}
            >
              <span>{reaction.emoji}</span>
              {reaction.count > 1 && (
                <span
                  className={cn(
                    'text-[10px]',
                    reaction.userReacted ? 'text-primary-500' : 'text-[var(--text-muted)]'
                  )}
                >
                  {reaction.count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Add reaction button - only show when hovered or picker is open */}
      {(showAddButton || showPicker) && (
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowPicker(!showPicker)
            }}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full',
              'bg-[var(--bg-hover)] hover:bg-[var(--border-default)]',
              'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
              'transition-all',
              showPicker && 'bg-primary-500/20 text-primary-500',
              !showAddButton && !showPicker && 'opacity-0'
            )}
          >
            <Smile className="h-4 w-4" />
          </button>

          {showPicker && (
            <EmojiPicker
              align="right"
              showStickers={false}
              onSelect={(emoji) => {
                onToggleReaction(emoji)
                setShowPicker(false)
              }}
              onSelectSticker={(sticker) => {
                onToggleReaction(sticker)
                setShowPicker(false)
              }}
              onClose={() => setShowPicker(false)}
            />
          )}
        </div>
      )}
    </div>
  )
}
