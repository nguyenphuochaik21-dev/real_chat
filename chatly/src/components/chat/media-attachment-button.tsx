'use client'

import { useCallback, useRef } from 'react'
import { FileAudio, Images } from 'lucide-react'
import { useMediaUpload } from '@/hooks/use-media-upload'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { Tables } from '@/types'
import { queuePushNotification } from '@/lib/push'

type Message = Tables<'messages'>
type AttachmentGroup = 'media' | 'files'

interface MediaAttachmentButtonProps {
  conversationId: string
  userId: string
  onUploadComplete?: (message: Message) => void
  className?: string
}

const ACCEPTED_FILES: Record<AttachmentGroup, string> = {
  media: 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm',
  files:
    'audio/mpeg,audio/ogg,audio/wav,application/pdf,application/zip,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export function MediaAttachmentButton({
  conversationId,
  userId,
  onUploadComplete,
  className,
}: MediaAttachmentButtonProps) {
  const mediaInputRef = useRef<HTMLInputElement>(null)
  const filesInputRef = useRef<HTMLInputElement>(null)
  const { t } = useI18n()
  const { upload, uploading, progress, error } = useMediaUpload({
    conversationId,
    userId,
    onUploadComplete,
    onError: (uploadError) => console.error('Upload error:', uploadError),
  })

  const handleFileSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(event.target.files ?? [])
      event.target.value = ''
      const files = selectedFiles.slice(0, 12)
      const isImageGroup = files.length > 1 && files.every((file) => file.type.startsWith('image/'))
      const mediaGroupId = isImageGroup ? crypto.randomUUID() : undefined

      let lastUploaded: Message | null = null
      for (const file of files) lastUploaded = (await upload(file, mediaGroupId)) ?? lastUploaded
      if (lastUploaded) queuePushNotification(lastUploaded.id)
    },
    [upload]
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
            disabled={uploading}
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-lg transition-colors md:h-10 md:w-10',
              'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
              uploading && 'cursor-not-allowed opacity-50'
            )}
            title={label}
            aria-label={label}
          >
            <Icon className="h-5 w-5" />
          </button>
        </div>
      ))}

      {uploading && (
        <div className="absolute right-0 bottom-full left-0 mb-2 rounded-lg bg-black/80 px-2 py-1 text-center text-xs font-medium whitespace-nowrap text-white">
          {t('attachment.uploading', { progress })}
        </div>
      )}

      {error && (
        <div className="absolute bottom-full left-0 mb-2 max-w-56 rounded bg-red-500 px-2 py-1 text-xs text-white">
          {error}
        </div>
      )}
    </div>
  )
}
