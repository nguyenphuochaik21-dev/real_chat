'use client'

import { useRef, useCallback } from 'react'
import { Image, Video, Music, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMediaUpload } from '@/hooks/use-media-upload'
import type { Tables } from '@/types'

type Message = Tables<'messages'>

interface MediaAttachmentButtonProps {
  conversationId: string
  userId: string
  onUploadComplete?: (message: Message) => void
  className?: string
}

export function MediaAttachmentButton({
  conversationId,
  userId,
  onUploadComplete,
  className,
}: MediaAttachmentButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { upload, uploading, progress, error } = useMediaUpload({
    conversationId,
    userId,
    onUploadComplete,
    onError: (err) => console.error('Upload error:', err),
  })

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      await upload(file)
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }, [upload])

  const handleClick = (type: 'image' | 'video' | 'audio' | 'file') => {
    if (fileInputRef.current) {
      // Set accept based on type
      const accepts = {
        image: 'image/jpeg,image/png,image/gif,image/webp',
        video: 'video/mp4,video/webm',
        audio: 'audio/mpeg,audio/ogg,audio/wav',
        file: 'application/pdf,application/zip,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }
      fileInputRef.current.accept = accepts[type]
      fileInputRef.current.click()
    }
  }

  return (
    <div className={cn('relative', className)}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Upload progress overlay */}
      {uploading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
          <div className="text-white text-sm font-medium">{progress}%</div>
        </div>
      )}

      {/* Attachment button */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => handleClick('image')}
          className={cn(
            'p-2 rounded-lg transition-colors',
            'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
            uploading && 'opacity-50 cursor-not-allowed'
          )}
          title="Send image"
          disabled={uploading}
        >
          <Image className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={() => handleClick('video')}
          className={cn(
            'p-2 rounded-lg transition-colors',
            'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
            uploading && 'opacity-50 cursor-not-allowed'
          )}
          title="Send video"
          disabled={uploading}
        >
          <Video className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={() => handleClick('audio')}
          className={cn(
            'p-2 rounded-lg transition-colors',
            'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
            uploading && 'opacity-50 cursor-not-allowed'
          )}
          title="Send audio"
          disabled={uploading}
        >
          <Music className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={() => handleClick('file')}
          className={cn(
            'p-2 rounded-lg transition-colors',
            'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]',
            uploading && 'opacity-50 cursor-not-allowed'
          )}
          title="Send file"
          disabled={uploading}
        >
          <FileText className="h-5 w-5" />
        </button>
      </div>

      {/* Error toast */}
      {error && (
        <div className="absolute top-full left-0 mt-1 px-2 py-1 bg-red-500 text-white text-xs rounded whitespace-nowrap">
          {error}
        </div>
      )}
    </div>
  )
}
