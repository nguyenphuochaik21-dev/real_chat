'use client'

import Image from 'next/image'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Image as ImageIcon,
  Film,
  Music,
  FileText,
  X,
  ChevronLeft,
  ChevronRight,
  Play,
  ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSignedUrl } from '@/hooks/use-signed-url'
import { useI18n } from '@/lib/i18n'
import { MediaDownloadButton } from './media-download-button'

const FilePreviewDialog = dynamic(() =>
  import('./file-preview-dialog').then((module) => module.FilePreviewDialog)
)

export interface MediaItem {
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
  loading?: boolean
  onShowAll?: () => void
  className?: string
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileTypeIcon({ type, className }: { type: string; className?: string }) {
  if (type === 'image') return <ImageIcon className={className} />
  if (type === 'video') return <Film className={className} />
  if (type === 'audio') return <Music className={className} />
  return <FileText className={className} />
}

function getFileColor(type: string): string {
  if (type === 'image') return 'bg-emerald-500'
  if (type === 'video') return 'bg-blue-500'
  if (type === 'audio') return 'bg-purple-500'
  return 'bg-amber-500'
}

export function MediaGallery({
  mediaItems,
  totalCount,
  loading = false,
  onShowAll,
  className,
}: MediaGalleryProps) {
  const { t } = useI18n()
  const [activeMediaId, setActiveMediaId] = useState<string | null>(null)
  const activeItem = mediaItems.find((item) => item.id === activeMediaId)
  if (mediaItems.length === 0) {
    return (
      <div className={cn('py-4', className)}>
        <h3 className="mb-3 text-sm font-medium text-[var(--text-muted)]">{t('gallery.title')}</h3>
        {loading ? (
          <div className="h-16 animate-pulse rounded-xl bg-[var(--bg-hover)]" aria-busy="true" />
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">{t('gallery.none')}</p>
        )}
      </div>
    )
  }

  return (
    <div className={cn('py-4', className)}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-[var(--text-muted)]">{t('gallery.title')}</h3>
        {totalCount > 0 && (
          <button onClick={onShowAll} className="text-primary-500 text-xs hover:underline">
            {totalCount}
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {mediaItems.slice(0, 6).map((item) => (
          <MediaGalleryItem key={item.id} item={item} onOpen={setActiveMediaId} />
        ))}
      </div>
      {onShowAll && (
        <button
          type="button"
          onClick={onShowAll}
          className="text-primary-500 mt-3 flex w-full items-center justify-center gap-1 rounded-lg py-2 text-sm font-medium hover:bg-[var(--bg-hover)]"
        >
          {t('gallery.showAll')} <ArrowRight className="h-4 w-4" />
        </button>
      )}
      {activeItem?.type === 'file' && (
        <FilePreviewDialog
          path={activeItem.url}
          name={activeItem.name || t('gallery.untitled')}
          mimeType={activeItem.mimeType}
          size={activeItem.size}
          onClose={() => setActiveMediaId(null)}
        />
      )}
      {activeItem && activeItem.type !== 'file' && (
        <MediaLightbox
          items={mediaItems}
          activeId={activeItem.id}
          onSelect={setActiveMediaId}
          onClose={() => setActiveMediaId(null)}
        />
      )}
    </div>
  )
}

// Individual gallery item that resolves signed URL
function MediaGalleryItem({ item, onOpen }: { item: MediaItem; onOpen: (id: string) => void }) {
  const { t } = useI18n()
  const { signedUrl } = useSignedUrl(item.type === 'image' ? item.url : null)

  if (item.type === 'image' && signedUrl) {
    return (
      <button
        onClick={() => onOpen(item.id)}
        className="relative aspect-square overflow-hidden rounded-lg transition-opacity hover:opacity-80"
        title={item.name || t('gallery.images')}
      >
        <Image
          src={signedUrl}
          alt={item.name || t('gallery.images')}
          fill
          sizes="96px"
          className="h-full w-full object-cover"
        />
      </button>
    )
  }

  // Render file icon for non-image types
  const color = getFileColor(item.type)
  return (
    <button
      onClick={() => {
        if (item.type !== 'image') onOpen(item.id)
      }}
      className={cn(
        'flex aspect-square items-center justify-center rounded-lg text-white transition-opacity hover:opacity-80',
        color
      )}
      title={item.name || t('gallery.files')}
    >
      <FileTypeIcon type={item.type} className="h-6 w-6" />
    </button>
  )
}

// Full gallery viewer with tabs
interface MediaGalleryViewerProps {
  items: MediaItem[]
  totalCount: number
  loading?: boolean
  loadingMore?: boolean
  moreError?: boolean
  hasMore?: boolean
  onLoadMore?: () => void
  error?: boolean
  onRetry?: () => void
  onClose: () => void
}

type FilterType = 'all' | 'image' | 'video' | 'audio' | 'file'

export function MediaGalleryViewer({
  items,
  totalCount,
  loading = false,
  loadingMore = false,
  moreError = false,
  hasMore = false,
  onLoadMore,
  error = false,
  onRetry,
  onClose,
}: MediaGalleryViewerProps) {
  const { t } = useI18n()
  const [filter, setFilter] = useState<FilterType>('all')
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null)
  const activeItem = items.find((item) => item.id === selectedItem?.id) || selectedItem
  const activeMediaId = activeItem?.id || null
  const openItem = (id: string) => {
    const item = items.find((candidate) => candidate.id === id)
    if (item) setSelectedItem(item)
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !activeMediaId) onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [activeMediaId, onClose])

  const filteredItems = filter === 'all' ? items : items.filter((item) => item.type === filter)

  const counts = {
    all: items.length,
    image: items.filter((i) => i.type === 'image').length,
    video: items.filter((i) => i.type === 'video').length,
    audio: items.filter((i) => i.type === 'audio').length,
    file: items.filter((i) => i.type === 'file').length,
  }

  const tabs: { key: FilterType; label: string; count: number }[] = [
    { key: 'all' as FilterType, label: t('gallery.all'), count: counts.all },
    { key: 'image' as FilterType, label: t('gallery.images'), count: counts.image },
    { key: 'video' as FilterType, label: t('gallery.videos'), count: counts.video },
    { key: 'audio' as FilterType, label: t('gallery.audio'), count: counts.audio },
    { key: 'file' as FilterType, label: t('gallery.files'), count: counts.file },
  ].filter((tab) => tab.count > 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="media-gallery-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="flex h-full max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-[var(--bg-panel)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-default)] p-4">
          <div>
            <h2
              id="media-gallery-title"
              className="text-lg font-semibold text-[var(--text-primary)]"
            >
              {t('gallery.title')}
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              {t('gallery.shared', { count: totalCount })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[var(--bg-hover)]"
            aria-label={t('common.close')}
          >
            <X className="h-5 w-5 text-[var(--text-secondary)]" />
          </button>
        </div>

        {/* Tabs */}
        {tabs.length > 0 && (
          <div className="flex gap-2 overflow-x-auto border-b border-[var(--border-default)] px-4 py-2">
            {tabs.map((tab) => (
              <button
                type="button"
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  filter === tab.key
                    ? 'bg-primary-500 text-white'
                    : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-[var(--bg-active)]'
                )}
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && items.length === 0 ? (
            <div className="flex h-full items-center justify-center" aria-busy="true">
              <div className="border-primary-500 h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
            </div>
          ) : error ? (
            <div
              role="alert"
              className="flex h-full flex-col items-center justify-center gap-3 text-center"
            >
              <p>{t('common.unknownError')}</p>
              <button type="button" onClick={onRetry} className="text-primary-500 underline">
                {t('calls.retry')}
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-[var(--text-muted)]">
              <ImageIcon className="h-12 w-12" />
              <p>{t('gallery.none')}</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[var(--text-muted)]">
              {t('gallery.emptyCategory')}
            </div>
          ) : filter === 'image' ? (
            // Image grid view
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {filteredItems.map((item) => (
                <GalleryImageItem key={item.id} item={item} onOpen={openItem} />
              ))}
            </div>
          ) : (
            // File list view for videos/audio/files
            <div className="space-y-2">
              {filteredItems.map((item) => (
                <GalleryFileItem key={item.id} item={item} onOpen={openItem} />
              ))}
            </div>
          )}
          {hasMore && !error && (
            <div className="mt-4 text-center">
              {moreError && (
                <p role="alert" className="mb-2 text-sm text-red-500">
                  {t('gallery.loadMoreFailed')}
                </p>
              )}
              <button
                type="button"
                onClick={onLoadMore}
                disabled={loading || loadingMore}
                className="text-primary-500 rounded-lg px-4 py-2 text-sm font-medium hover:bg-[var(--bg-hover)] disabled:opacity-50"
              >
                {loadingMore ? t('common.loading') : t('gallery.loadMore')}
              </button>
            </div>
          )}
        </div>
      </div>
      {activeItem?.type === 'file' && (
        <FilePreviewDialog
          path={activeItem.url}
          name={activeItem.name || t('gallery.untitled')}
          mimeType={activeItem.mimeType}
          size={activeItem.size}
          onClose={() => setSelectedItem(null)}
        />
      )}
      {activeItem && activeItem.type !== 'file' && (
        <MediaLightbox
          items={items}
          activeId={activeItem.id}
          onSelect={openItem}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  )
}

function GalleryImageItem({ item, onOpen }: { item: MediaItem; onOpen: (id: string) => void }) {
  const { t } = useI18n()
  const { signedUrl } = useSignedUrl(item.url)

  return (
    <div className="relative aspect-square overflow-hidden rounded-lg bg-[var(--bg-hover)]">
      {signedUrl ? (
        <Image
          src={signedUrl}
          alt={item.name || t('gallery.images')}
          fill
          sizes="(max-width: 640px) 50vw, 33vw"
          className="h-full w-full cursor-pointer object-cover transition-transform hover:scale-105"
          onClick={() => onOpen(item.id)}
        />
      ) : (
        <div className="h-full w-full animate-pulse" />
      )}
    </div>
  )
}

function GalleryFileItem({ item, onOpen }: { item: MediaItem; onOpen: (id: string) => void }) {
  const { t } = useI18n()
  const color = getFileColor(item.type)

  return (
    <div className="flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-[var(--bg-hover)]">
      <button
        type="button"
        onClick={() => onOpen(item.id)}
        className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden text-left"
        aria-label={`${t('gallery.preview')} ${item.name || t('gallery.untitled')}`}
      >
        <span
          className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-lg', color)}
        >
          <FileTypeIcon type={item.type} className="h-6 w-6 text-white" />
        </span>
        <span className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--text-primary)]">
            {item.name || t('gallery.untitled')}
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            {formatFileSize(item.size)}
            {item.mimeType && ` · ${item.mimeType.split('/').pop()?.toUpperCase()}`}
          </p>
        </span>
      </button>
      {(item.type === 'image' || item.type === 'video') && (
        <button
          type="button"
          onClick={() => onOpen(item.id)}
          className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-[var(--bg-active)]"
          aria-label={item.type === 'video' ? t('gallery.videos') : t('gallery.images')}
        >
          {item.type === 'video' ? (
            <Play className="h-4 w-4 text-[var(--text-secondary)]" />
          ) : (
            <ImageIcon className="h-4 w-4 text-[var(--text-secondary)]" />
          )}
        </button>
      )}
      <MediaDownloadButton
        path={item.url}
        filename={item.name}
        className="text-[var(--text-secondary)] hover:bg-[var(--bg-active)]"
      />
    </div>
  )
}

interface MediaLightboxProps {
  items: MediaItem[]
  activeId: string
  onSelect: (id: string) => void
  onClose: () => void
}

export function MediaLightbox({ items, activeId, onSelect, onClose }: MediaLightboxProps) {
  const { t } = useI18n()
  const previewItems = useMemo(() => items.filter((item) => item.type !== 'file'), [items])
  const activeIndex = Math.max(
    0,
    previewItems.findIndex((item) => item.id === activeId)
  )
  const activeItem = previewItems[activeIndex]
  const { signedUrl, loading } = useSignedUrl(activeItem?.url)

  const selectOffset = useCallback(
    (offset: number) => {
      if (previewItems.length < 2) return
      const nextIndex = (activeIndex + offset + previewItems.length) % previewItems.length
      onSelect(previewItems[nextIndex].id)
    },
    [activeIndex, onSelect, previewItems]
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft') selectOffset(-1)
      if (event.key === 'ArrowRight') selectOffset(1)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, selectOffset])

  if (!activeItem) return null

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 p-2 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={activeItem.name || t('gallery.title')}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="relative flex h-full w-full max-w-6xl items-center justify-center">
        <MediaDownloadButton
          path={activeItem.url}
          filename={activeItem.name}
          className="absolute top-2 right-14 z-20 bg-black/60 text-white hover:bg-black/80"
        />
        <button
          type="button"
          onClick={onClose}
          className="absolute top-2 right-2 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
          aria-label={t('common.close')}
        >
          <X className="h-5 w-5" />
        </button>

        {previewItems.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => selectOffset(-1)}
              className="absolute left-2 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 sm:left-4"
              aria-label={t('common.previous')}
            >
              <ChevronLeft className="h-7 w-7" />
            </button>
            <button
              type="button"
              onClick={() => selectOffset(1)}
              className="absolute right-2 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 sm:right-4"
              aria-label={t('common.next')}
            >
              <ChevronRight className="h-7 w-7" />
            </button>
          </>
        )}

        <div className="flex h-full w-full flex-col items-center justify-center gap-3 py-14">
          {loading || !signedUrl ? (
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : activeItem.type === 'video' ? (
            <video
              key={activeItem.id}
              src={signedUrl}
              className="max-h-full max-w-full rounded-lg object-contain"
              controls
              autoPlay
              playsInline
            />
          ) : activeItem.type === 'audio' ? (
            <audio
              key={activeItem.id}
              src={signedUrl}
              controls
              autoPlay
              className="w-full max-w-lg"
            />
          ) : (
            <div className="relative h-full w-full">
              <Image
                src={signedUrl}
                alt={activeItem.name || t('gallery.images')}
                fill
                sizes="100vw"
                className="object-contain"
                priority
              />
            </div>
          )}
          <p className="max-w-full truncate px-16 text-sm text-white/80">
            {activeItem.name ? `${activeItem.name} · ` : ''}
            {activeIndex + 1}/{previewItems.length}
          </p>
        </div>
      </div>
    </div>
  )
}
