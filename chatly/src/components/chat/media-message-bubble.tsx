'use client'

import { useState } from 'react'
import { Play, Pause, Download, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Tables } from '@/types'
import { isImage, isVideo, isAudio } from '@/lib/supabase/storage'
import { useSignedUrl } from '@/hooks/use-signed-url'

type Message = Tables<'messages'>

interface MediaMessageBubbleProps {
  message: Message
  isFromMe: boolean
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function MediaMessageBubble({ message, isFromMe }: MediaMessageBubbleProps) {
  const mediaPath = message.media_url
  const mimeType = message.media_mime_type
  const fileName = message.media_name || 'File'
  const fileSize = message.media_size

  const { signedUrl, loading, error } = useSignedUrl(mediaPath)
  const [playing, setPlaying] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)

  if (error) {
    return (
      <div className={cn(
        'flex items-center gap-3 rounded-2xl px-4 py-3 min-w-[200px] max-w-[280px]',
        isFromMe ? 'bg-primary-500 text-white' : 'bg-[var(--bg-message-in)]'
      )}>
        <FileText className="h-5 w-5 opacity-70" />
        <p className="text-sm">Failed to load media</p>
      </div>
    )
  }

  if (loading || !signedUrl) {
    return (
      <div className={cn(
        'flex items-center justify-center rounded-2xl px-4 py-3 min-w-[200px] min-h-[100px]',
        isFromMe ? 'bg-primary-500' : 'bg-[var(--bg-message-in)]'
      )}>
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      </div>
    )
  }

  // Image message
  if (isImage(mimeType)) {
    return (
      <div className={cn('rounded-2xl overflow-hidden', isFromMe ? 'rounded-br-md' : 'rounded-bl-md')}>
        <img
          src={signedUrl}
          alt={fileName}
          className={cn(
            'max-w-[280px] max-h-[300px] object-cover cursor-pointer',
            !imageLoaded && 'blur-sm'
          )}
          onLoad={() => setImageLoaded(true)}
          onClick={() => window.open(signedUrl, '_blank')}
        />
        {message.content && message.content !== fileName && (
          <p className="px-3 py-2 text-sm">{message.content}</p>
        )}
      </div>
    )
  }

  // Video message
  if (isVideo(mimeType)) {
    return (
      <div className={cn('rounded-2xl overflow-hidden', isFromMe ? 'rounded-br-md' : 'rounded-bl-md')}>
        <div className="relative max-w-[280px]">
          <video
            src={signedUrl}
            className="max-w-[280px] max-h-[200px] object-cover"
            controls
          />
        </div>
        {message.content && message.content !== fileName && (
          <p className="px-3 py-2 text-sm">{message.content}</p>
        )}
      </div>
    )
  }

  // Audio message
  if (isAudio(mimeType)) {
    return (
      <div className={cn(
        'flex items-center gap-3 rounded-2xl px-4 py-3 min-w-[200px]',
        isFromMe ? 'bg-primary-500 text-white rounded-br-md' : 'bg-[var(--bg-message-in)] rounded-bl-md'
      )}>
        <button
          onClick={() => setPlaying(!playing)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
        >
          {playing ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5 ml-0.5" />
          )}
        </button>
        <div className="flex-1">
          <p className="text-sm font-medium truncate">{fileName}</p>
          <audio
            src={signedUrl}
            className="hidden"
            onEnded={() => setPlaying(false)}
          />
          <div className="h-1 rounded-full mt-1 bg-white/30">
            <div className="h-full w-0 rounded-full bg-white" />
          </div>
        </div>
        {fileSize && (
          <span className={cn(
            'text-xs',
            isFromMe ? 'text-white/70' : 'text-[var(--text-muted)]'
          )}>
            {formatFileSize(fileSize)}
          </span>
        )}
      </div>
    )
  }

  // Generic file message
  return (
    <div className={cn(
      'flex items-center gap-3 rounded-2xl px-4 py-3 min-w-[200px] max-w-[280px]',
      isFromMe ? 'bg-primary-500 text-white rounded-br-md' : 'bg-[var(--bg-message-in)] rounded-bl-md'
    )}>
      <div className={cn(
        'flex h-10 w-10 items-center justify-center rounded-lg',
        isFromMe ? 'bg-white/20' : 'bg-[var(--bg-hover)]'
      )}>
        <FileText className={cn(
          'h-5 w-5',
          isFromMe ? 'text-white' : 'text-[var(--text-muted)]'
        )} />
      </div>
      <div className="flex-1 overflow-hidden">
        <p className="text-sm font-medium truncate">{fileName}</p>
        {fileSize && (
          <p className={cn(
            'text-xs',
            isFromMe ? 'text-white/70' : 'text-[var(--text-muted)]'
          )}>
            {formatFileSize(fileSize)}
          </p>
        )}
      </div>
      <a
        href={signedUrl}
        download={fileName}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
          isFromMe ? 'hover:bg-white/20' : 'hover:bg-[var(--bg-hover)]'
        )}
      >
        <Download className="h-4 w-4" />
      </a>
    </div>
  )
}