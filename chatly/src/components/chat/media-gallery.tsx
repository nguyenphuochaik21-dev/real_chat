'use client'

import { useState } from 'react'
import { Image as ImageIcon, Film, Music, FileText, Download, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSignedUrl } from '@/hooks/use-signed-url'

interface MediaItem {
  id: string
  url: string
  type: 'image' | 'video' | 'audio' | 'file'
  name: string | null
  size: number | null
  mimeType: string | null
}

interface MediaGalleryProps {
  mediaItems: MediaItem[]
  totalCount: number
  onShowAll?: () => void
  className?: string
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(type: string) {
  if (type === 'image') return ImageIcon
  if (type === 'video') return Film
  if (type === 'audio') return Music
  return FileText
}

function getFileColor(type: string): string {
  if (type === 'image') return 'bg-emerald-500'
  if (type === 'video') return 'bg-blue-500'
  if (type === 'audio') return 'bg-purple-500'
  return 'bg-amber-500'
}

export function MediaGallery({ mediaItems, totalCount, onShowAll, className }: MediaGalleryProps) {
  if (mediaItems.length === 0) {
    return (
      <div className={cn('py-4', className)}>
        <h3 className="mb-3 text-sm font-medium text-[var(--text-muted)]">
          Media, Links and Docs
        </h3>
        <p className="text-sm text-[var(--text-secondary)]">
          No media shared yet
        </p>
      </div>
    )
  }

  return (
    <div className={cn('py-4', className)}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-[var(--text-muted)]">
          Media, Links and Docs
        </h3>
        {totalCount > 0 && (
          <button
            onClick={onShowAll}
            className="text-primary-500 text-xs hover:underline"
          >
            {totalCount}
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {mediaItems.slice(0, 6).map((item) => (
          <MediaGalleryItem key={item.id} item={item} />
        ))}
      </div>
    </div>
  )
}

// Individual gallery item that resolves signed URL
function MediaGalleryItem({ item }: { item: MediaItem }) {
  const { signedUrl } = useSignedUrl(item.url)

  if (item.type === 'image' && signedUrl) {
    return (
      <button
        onClick={() => signedUrl && window.open(signedUrl, '_blank')}
        className="aspect-square overflow-hidden rounded-lg hover:opacity-80 transition-opacity"
        title={item.name || 'Image'}
      >
        <img
          src={signedUrl}
          alt={item.name || 'Image'}
          className="h-full w-full object-cover"
        />
      </button>
    )
  }

  // Render file icon for non-image types
  const Icon = getFileIcon(item.type)
  const color = getFileColor(item.type)
  return (
    <button
      onClick={() => signedUrl && window.open(signedUrl, '_blank')}
      className={cn(
        'flex aspect-square items-center justify-center rounded-lg text-white hover:opacity-80 transition-opacity',
        color
      )}
      title={item.name || 'File'}
    >
      <Icon className="h-6 w-6" />
    </button>
  )
}

// Full gallery viewer with tabs
interface MediaGalleryViewerProps {
  items: MediaItem[]
  onClose: () => void
}

type FilterType = 'all' | 'image' | 'video' | 'audio' | 'file'

export function MediaGalleryViewer({ items, onClose }: MediaGalleryViewerProps) {
  const [filter, setFilter] = useState<FilterType>('all')

  if (items.length === 0) return null

  const filteredItems = filter === 'all'
    ? items
    : items.filter(item => item.type === filter)

  const counts = {
    all: items.length,
    image: items.filter(i => i.type === 'image').length,
    video: items.filter(i => i.type === 'video').length,
    audio: items.filter(i => i.type === 'audio').length,
    file: items.filter(i => i.type === 'file').length,
  }

  const tabs: { key: FilterType; label: string; count: number }[] = [
    { key: 'all' as FilterType, label: 'All', count: counts.all },
    { key: 'image' as FilterType, label: 'Images', count: counts.image },
    { key: 'video' as FilterType, label: 'Videos', count: counts.video },
    { key: 'audio' as FilterType, label: 'Audio', count: counts.audio },
    { key: 'file' as FilterType, label: 'Files', count: counts.file },
  ].filter(tab => tab.count > 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="flex h-full max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-[var(--bg-panel)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-default)] p-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Media, Links and Docs
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              {items.length} files shared
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[var(--bg-hover)]"
          >
            <X className="h-5 w-5 text-[var(--text-secondary)]" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-[var(--border-default)] px-4 py-2">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                filter === tab.key
                  ? 'bg-primary-500 text-white'
                  : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--bg-active)]'
              )}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredItems.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[var(--text-muted)]">
              No items in this category
            </div>
          ) : filter === 'image' ? (
            // Image grid view
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {filteredItems.map(item => (
                <GalleryImageItem key={item.id} item={item} />
              ))}
            </div>
          ) : (
            // File list view for videos/audio/files
            <div className="space-y-2">
              {filteredItems.map(item => (
                <GalleryFileItem key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function GalleryImageItem({ item }: { item: MediaItem }) {
  const { signedUrl } = useSignedUrl(item.url)

  return (
    <div className="aspect-square overflow-hidden rounded-lg bg-[var(--bg-hover)]">
      {signedUrl ? (
        <img
          src={signedUrl}
          alt={item.name || 'Image'}
          className="h-full w-full object-cover cursor-pointer hover:scale-105 transition-transform"
          onClick={() => signedUrl && window.open(signedUrl, '_blank')}
        />
      ) : (
        <div className="h-full w-full animate-pulse" />
      )}
    </div>
  )
}

function GalleryFileItem({ item }: { item: MediaItem }) {
  const { signedUrl } = useSignedUrl(item.url)
  const Icon = getFileIcon(item.type)
  const color = getFileColor(item.type)

  return (
    <div className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-[var(--bg-hover)]">
      <div className={cn(
        'flex h-12 w-12 items-center justify-center rounded-lg shrink-0',
        color
      )}>
        <Icon className="h-6 w-6 text-white" />
      </div>
      <div className="flex-1 overflow-hidden">
        <p className="truncate text-sm font-medium text-[var(--text-primary)]">
          {item.name || 'Untitled'}
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          {formatFileSize(item.size)}
          {item.mimeType && ` · ${item.mimeType.split('/').pop()?.toUpperCase()}`}
        </p>
      </div>
      {signedUrl && (
        <a
          href={signedUrl}
          download={item.name || undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[var(--bg-active)]"
        >
          <Download className="h-4 w-4 text-[var(--text-secondary)]" />
        </a>
      )}
    </div>
  )
}
