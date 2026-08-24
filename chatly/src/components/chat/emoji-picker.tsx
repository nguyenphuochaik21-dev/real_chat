'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onClose: () => void
}

// Common emojis for quick selection
const QUICK_EMOJIS = [
  '👍', '👎', '❤️', '🧡', '💛', '💚', '💙', '💜',
  '😂', '😢', '😮', '😡', '😱', '🤔', '🙄', '😴',
  '🎉', '🔥', '✨', '💯', '✅', '❌', '⭐', '💫',
]

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  return (
    <div
      ref={pickerRef}
      className={cn(
        'absolute bottom-full left-0 mb-2 z-50',
        'w-72 rounded-xl border border-[var(--border-default)]',
        'bg-[var(--bg-panel)] shadow-xl animate-fade-in'
      )}
    >
      {/* Quick emojis grid */}
      <div className="grid grid-cols-8 gap-1 p-2">
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => onSelect(emoji)}
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-lg',
              'text-lg hover:bg-[var(--bg-hover)] transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-primary-500'
            )}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
