'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { Smile } from 'lucide-react'
import type { MessageReaction } from '@/lib/actions/messages'

const REACTION_CHOICES = [
  { emoji: '❤️', label: 'Tim' },
  { emoji: '😂', label: 'Cười' },
  { emoji: '😮', label: 'Wow' },
  { emoji: '😡', label: 'Phẫn nộ' },
  { emoji: '😢', label: 'Khóc' },
] as const

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
  const [pickerPosition, setPickerPosition] = useState({ left: 8, top: 8 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showPicker) return

    const close = (event: PointerEvent) => {
      const target = event.target as Node
      if (!pickerRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setShowPicker(false)
      }
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [showPicker])

  const togglePicker = () => {
    if (!showPicker && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const pickerWidth = 244
      const left = Math.max(
        8,
        Math.min(rect.right - pickerWidth, window.innerWidth - pickerWidth - 8)
      )
      const top = rect.top >= 58 ? rect.top - 50 : rect.bottom + 8
      setPickerPosition({ left, top })
    }
    setShowPicker((current) => !current)
  }

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
            ref={buttonRef}
            onClick={(e) => {
              e.stopPropagation()
              togglePicker()
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

          {showPicker &&
            createPortal(
              <div
                ref={pickerRef}
                role="menu"
                className="fixed z-[100] flex items-center gap-1 rounded-full border border-[var(--border-default)] bg-[var(--bg-panel)] p-1.5 shadow-xl"
                style={pickerPosition}
              >
                {REACTION_CHOICES.map((choice) => (
                  <button
                    key={choice.emoji}
                    type="button"
                    role="menuitem"
                    title={choice.label}
                    aria-label={choice.label}
                    onClick={() => {
                      onToggleReaction(choice.emoji)
                      setShowPicker(false)
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-xl transition-transform hover:scale-125 hover:bg-[var(--bg-hover)]"
                  >
                    {choice.emoji}
                  </button>
                ))}
              </div>,
              document.body
            )}
        </div>
      )}
    </div>
  )
}
