import { NextResponse } from 'next/server'
import { supportedPreviewUrl } from '@/lib/preview-url'

export const runtime = 'nodejs'

function unavailable() {
  return NextResponse.json(null, { headers: { 'Cache-Control': 'public, max-age=300' } })
}

async function limitedText(response: Response, limit: number) {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder()
  let total = 0
  let text = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > limit) {
        await reader.cancel()
        throw new Error('Preview too large')
      }
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  } finally {
    reader.releaseLock()
  }
}

function decodeEntities(value: string) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .trim()
}

function metaValue(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      'i'
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
      'i'
    ),
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return decodeEntities(match[1]).slice(0, 600)
  }
  return null
}

async function getOembedPreview(url: URL, signal: AbortSignal) {
  const host = url.hostname.toLowerCase()
  const endpoint = host.includes('youtu')
    ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url.toString())}`
    : host.endsWith('vimeo.com')
      ? `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url.toString())}`
      : null
  if (!endpoint) return null
  const response = await fetch(endpoint, { signal, redirect: 'error' })
  if (!response.ok) return null
  const value = JSON.parse(await limitedText(response, 50_000)) as Record<string, unknown>
  if (typeof value.title !== 'string') return null
  return {
    url: url.toString(),
    host: url.hostname.replace(/^www\./, ''),
    title: value.title.slice(0, 180),
    description: typeof value.author_name === 'string' ? value.author_name.slice(0, 300) : null,
    image: typeof value.thumbnail_url === 'string' ? value.thumbnail_url : null,
  }
}

export async function GET(request: Request) {
  const requested = supportedPreviewUrl(new URL(request.url).searchParams.get('url'))
  if (!requested) return NextResponse.json({ error: 'Unsupported URL' }, { status: 400 })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const oembed = await getOembedPreview(requested, controller.signal)
    if (oembed) {
      return NextResponse.json(oembed, {
        headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
      })
    }
    const response = await fetch(requested, {
      signal: controller.signal,
      redirect: 'manual',
      headers: { 'User-Agent': 'ChatlyLinkPreview/1.0' },
    })
    if (!response.ok) {
      await response.body?.cancel()
      return unavailable()
    }
    if (!(response.headers.get('content-type') ?? '').includes('text/html')) {
      await response.body?.cancel()
      return unavailable()
    }
    const length = Number(response.headers.get('content-length') ?? 0)
    if (length > 750_000) {
      await response.body?.cancel()
      return unavailable()
    }
    const html = await limitedText(response, 750_000)
    const rawTitle =
      metaValue(html, 'og:title') ??
      decodeEntities(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? '')
    if (!rawTitle) return unavailable()
    const image = metaValue(html, 'og:image')
    const imageUrl = image ? new URL(image, requested).toString() : null
    return NextResponse.json(
      {
        url: requested.toString(),
        host: requested.hostname.replace(/^www\./, ''),
        title: rawTitle.slice(0, 180),
        description: (metaValue(html, 'og:description') ?? metaValue(html, 'description'))?.slice(
          0,
          300
        ),
        image: imageUrl,
      },
      { headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' } }
    )
  } catch {
    return unavailable()
  } finally {
    clearTimeout(timeout)
  }
}
