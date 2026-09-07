'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

interface Preview {
  url: string
  host: string
  title: string
  description?: string | null
  image?: string | null
}

const previewCache = new Map<string, Preview | null>()
const URL_PATTERN = /https?:\/\/[^\s<>()]+/i

export function LinkPreview({ content }: { content: string }) {
  const { t } = useI18n()
  const url = content.match(URL_PATTERN)?.[0] ?? null
  const [preview, setPreview] = useState<Preview | null>(() =>
    url ? (previewCache.get(url) ?? null) : null
  )

  useEffect(() => {
    if (!url || previewCache.has(url)) return
    const controller = new AbortController()
    void fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, { signal: controller.signal })
      .then(async (response) => (response.ok ? ((await response.json()) as Preview) : null))
      .then((value) => {
        previewCache.set(url, value)
        setPreview(value)
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [url])

  if (!preview) return null

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 block max-w-sm overflow-hidden rounded-xl border border-black/10 bg-black/10 text-left no-underline"
      aria-label={`${t('chat.linkPreview')}: ${preview.title}`}
    >
      {preview.image && (
        <div className="relative aspect-video w-full bg-black/10">
          <Image
            src={`/api/link-preview/image?url=${encodeURIComponent(preview.image)}`}
            alt=""
            fill
            sizes="(max-width: 640px) 75vw, 360px"
            className="object-cover"
          />
        </div>
      )}
      <div className="p-3">
        <p className="flex items-center gap-1 text-xs opacity-70">
          {preview.host}
          <ExternalLink className="h-3 w-3" />
        </p>
        <p className="mt-1 line-clamp-2 text-sm font-semibold">{preview.title}</p>
        {preview.description && (
          <p className="mt-1 line-clamp-2 text-xs opacity-75">{preview.description}</p>
        )}
      </div>
    </a>
  )
}
