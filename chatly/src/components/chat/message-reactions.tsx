'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Smile } from 'lucide-react'
import { EmojiPicker } from './emoji-picker'
import type { MessageReaction } from '@/lib/actions/messages'

interface MessageReactionsProps {
  messageId: string
  reactions: MessageReaction[]
  onToggleReaction: (emoji: string) => void
}

export function MessageReactions({
  messageId,
  reactions,
  onToggleReaction,
}: MessageReactionsProps) {
  const [showPicker, setShowPicker] = useState(false)

  // Don't render if no reactions and picker is closed
  if (reactions.length === 0 && !showPicker) return null

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {/* Existing reactions */}
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          onClick={() => onToggleReaction(reaction.emoji)}
          className={cn(
            'flex items-center gap-1 rounded-full px-2 py-0.5 text-sm',
            'border border-transparent transition-all',
            'hover:scale-105 active:scale-95',
            reaction.userReacted
              ? 'bg-primary-500/20 border-primary-500'
              : 'bg-[var(--bg-hover)] hover:bg-[var(--border-default)]'
          )}
        >
          <span className="text-base">{reaction.emoji}</span>
          {reaction.count > 1 && (
            <span
              className={cn(
                'text-xs',
                reaction.userReacted
                  ? 'text-primary-500'
                  : 'text-[var(--text-muted)]'
              )}
            >
              {reaction.count}
            </span>
          )}
        </button>
      ))}

      {/* Add reaction button */}
      <div className="relative">
        <button
          onClick={() => setShowPicker(!showPicker)}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-full',
            'bg-[var(--bg-hover)] hover:bg-[var(--border-default)]',
            'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
            'transition-colors',
            showPicker && 'bg-primary-500/20 text-primary-500'
          )}
        >
          <Smile className="h-4 w-4" />
        </button>

        {showPicker && (
          <EmojiPicker
            onSelect={(emoji) => {
              onToggleReaction(emoji)
              setShowPicker(false)
            }}
            onClose={() => setShowPicker(false)}
          />
        )}
      </div>
    </div>
  )
}
