'use client'

import { useCallback, useRef } from 'react'
import { FileAudio, Images } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

type AttachmentGroup = 'media' | 'files'

interface MediaAttachmentButtonProps {
  onFilesSelected: (files: File[]) => void
  disabled?: boolean
  className?: string
}

const ACCEPTED_FILES: Record<AttachmentGroup, string> = {
  media: 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm',
  files:
    'audio/mpeg,audio/ogg,audio/wav,application/pdf,application/zip,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export function MediaAttachmentButton({
  onFilesSelected,
  disabled = false,
  className,
}: MediaAttachmentButtonProps) {
  const mediaInputRef = useRef<HTMLInputElement>(null)
  const filesInputRef = useRef<HTMLInputElement>(null)
  const { t } = useI18n()
  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? [])
      event.target.value = ''
      if (files.length > 0) onFilesSelected(files)
    },
    [onFilesSelected]
  )

  const buttons = [
    {
      group: 'media' as const,
      ref: mediaInputRef,
      icon: Images,
      label: t('attachment.media'),
    },
    {
      group: 'files' as const,
      ref: filesInputRef,
      icon: FileAudio,
      label: t('attachment.files'),
    },
  ]

  return (
    <div className={cn('relative flex shrink-0 items-center gap-0.5', className)}>
      {buttons.map(({ group, ref, icon: Icon, label }) => (
        <div key={group}>
          <input
            ref={ref}
            type="file"
            accept={ACCEPTED_FILES[group]}
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          <button
            type="button"
            onClick={() => ref.current?.click()}
            disabled={disabled}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-lg transition-colors md:h-10 md:w-10',
              'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
              disabled && 'cursor-not-allowed opacity-50'
            )}
            title={label}
            aria-label={label}
          >
            <Icon className="h-5 w-5" />
          </button>
        </div>
      ))}
    </div>
  )
}
