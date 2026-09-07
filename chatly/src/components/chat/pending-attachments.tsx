'use client'

import Image from 'next/image'
import { FileText, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PendingAttachment {
  id: string
  file: File
  previewUrl: string | null
}

interface PendingAttachmentsProps {
  attachments: PendingAttachment[]
  onRemove: (id: string) => void
  disabled?: boolean
}

export function PendingAttachments({
  attachments,
  onRemove,
  disabled = false,
}: PendingAttachmentsProps) {
  if (attachments.length === 0) return null

  return (
    <div className="flex scrollbar-thin gap-2 overflow-x-auto px-1 pb-2" aria-live="polite">
      {attachments.map((attachment) => {
        const isImage = attachment.file.type.startsWith('image/') && attachment.previewUrl
        return (
          <div
            key={attachment.id}
            className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--bg-hover)]"
          >
            {isImage ? (
              <Image
                src={attachment.previewUrl!}
                alt={attachment.file.name}
                fill
                unoptimized
                sizes="80px"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-1 p-2 text-center">
                <FileText className="h-6 w-6 text-[var(--text-muted)]" />
                <span className="w-full truncate text-[10px] text-[var(--text-secondary)]">
                  {attachment.file.name}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={() => onRemove(attachment.id)}
              disabled={disabled}
              aria-label={`Remove ${attachment.file.name}`}
              className={cn(
                'absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white shadow-sm transition-colors hover:bg-black/90',
                disabled && 'cursor-not-allowed opacity-50'
              )}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
