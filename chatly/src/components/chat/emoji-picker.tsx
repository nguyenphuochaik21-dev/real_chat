'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  onSelectSticker: (sticker: string) => void
  onClose: () => void
  align?: 'left' | 'right'
  showStickers?: boolean
}

const QUICK_EMOJIS = [
  '😀',
  '😃',
  '😄',
  '😁',
  '😆',
  '😅',
  '😂',
  '🤣',
  '😊',
  '😇',
  '🙂',
  '🙃',
  '😉',
  '😍',
  '🥰',
  '😘',
  '😋',
  '😎',
  '🤩',
  '🥳',
  '😏',
  '😒',
  '🙄',
  '😬',
  '🥺',
  '😢',
  '😭',
  '😤',
  '😡',
  '🤬',
  '🤯',
  '😱',
  '😳',
  '🤔',
  '🫡',
  '🤗',
  '🤭',
  '🫢',
  '🤫',
  '😴',
  '👍',
  '👎',
  '👏',
  '🙌',
  '🤝',
  '🙏',
  '💪',
  '👌',
  '✌️',
  '🤞',
  '🫶',
  '❤️',
  '🩷',
  '🧡',
  '💛',
  '💚',
  '💙',
  '💜',
  '🖤',
  '🤍',
  '💔',
  '❤️‍🔥',
  '🔥',
  '✨',
  '🎉',
  '🎊',
  '💯',
  '✅',
  '⭐',
  '🌟',
  '💥',
  '🚀',
]

const QUICK_STICKERS = [
  '🥳',
  '🤩',
  '🤣',
  '😍',
  '🥰',
  '😘',
  '😎',
  '🤓',
  '🫡',
  '🤗',
  '🤭',
  '🥺',
  '😭',
  '😱',
  '🤯',
  '😤',
  '😡',
  '😈',
  '👻',
  '🤖',
  '👽',
  '💩',
  '🙈',
  '🙉',
  '🙊',
  '👏',
  '🙌',
  '🙏',
  '💪',
  '🫶',
  '❤️',
  '❤️‍🔥',
  '💔',
  '🔥',
  '💯',
  '✨',
  '🎉',
  '🎊',
  '🎁',
  '🎂',
  '🍀',
  '🌈',
  '⭐',
  '🌟',
  '💥',
  '🚀',
  '🏆',
  '👑',
]

export function EmojiPicker({
  onSelect,
  onSelectSticker,
  onClose,
  align = 'left',
  showStickers = true,
}: EmojiPickerProps) {
  const [activeTab, setActiveTab] = useState<'emoji' | 'sticker'>('emoji')
  const pickerRef = useRef<HTMLDivElement>(null)
  const { t } = useI18n()

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) onClose()
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose])

  return (
    <div
      ref={pickerRef}
      data-emoji-picker
      className={cn(
        'animate-fade-in absolute bottom-full z-50 mb-2 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-panel)] shadow-xl',
        align === 'right' ? 'right-0' : 'left-0'
      )}
    >
      {showStickers && (
        <div className="grid grid-cols-2 border-b border-[var(--border-default)] p-1">
          {(['emoji', 'sticker'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              data-picker-tab={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                activeTab === tab
                  ? 'text-primary-500 bg-[var(--bg-active)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)]'
              )}
            >
              {t(`picker.${tab}`)}
            </button>
          ))}
        </div>
      )}

      <div
        className={cn(
          'grid max-h-64 gap-1 overflow-y-auto p-2',
          activeTab === 'emoji' ? 'grid-cols-8' : 'grid-cols-6'
        )}
      >
        {(activeTab === 'emoji' ? QUICK_EMOJIS : QUICK_STICKERS).map((item, index) => (
          <button
            key={`${item}-${index}`}
            type="button"
            data-picker-item
            data-picker-kind={activeTab}
            onClick={() => {
              if (activeTab === 'emoji') onSelect(item)
              else onSelectSticker(item)
            }}
            className={cn(
              'flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-hover)]',
              'focus:ring-primary-500 focus:ring-2 focus:outline-none',
              activeTab === 'emoji' ? 'h-8 w-8 text-lg' : 'h-10 w-10 text-3xl'
            )}
            aria-label={activeTab === 'emoji' ? item : t('picker.sendSticker', { sticker: item })}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  )
}
