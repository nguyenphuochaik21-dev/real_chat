import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const PREVIEW_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'vimeo.com',
  'www.vimeo.com',
  'github.com',
  'www.github.com',
])

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

function safePreviewUrl(value: string | null) {
  if (!value || value.length > 2000) return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !PREVIEW_HOSTS.has(url.hostname.toLowerCase())) return null
    url.username = ''
    url.password = ''
    return url
  } catch {
    return null
  }
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
  const value = (await response.json()) as Record<string, unknown>
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
  const requested = safePreviewUrl(new URL(request.url).searchParams.get('url'))
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
    if (!response.ok) return NextResponse.json({ error: 'Preview unavailable' }, { status: 404 })
    if (!(response.headers.get('content-type') ?? '').includes('text/html')) {
      return NextResponse.json({ error: 'Preview unavailable' }, { status: 415 })
    }
    const length = Number(response.headers.get('content-length') ?? 0)
    if (length > 750_000) return NextResponse.json({ error: 'Preview too large' }, { status: 413 })
    const html = (await response.text()).slice(0, 750_000)
    const rawTitle =
      metaValue(html, 'og:title') ??
      decodeEntities(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? '')
    if (!rawTitle) return NextResponse.json({ error: 'Preview unavailable' }, { status: 404 })
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
    return NextResponse.json({ error: 'Preview unavailable' }, { status: 404 })
  } finally {
    clearTimeout(timeout)
  }
}
