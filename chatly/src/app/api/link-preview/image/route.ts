import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const IMAGE_HOSTS = new Set([
  'i.ytimg.com',
  'img.youtube.com',
  'i.vimeocdn.com',
  'avatars.githubusercontent.com',
  'opengraph.githubassets.com',
])

export async function GET(request: Request) {
  const value = new URL(request.url).searchParams.get('url')
  try {
    if (!value || value.length > 2000) throw new Error('Invalid URL')
    const url = new URL(value)
    if (url.protocol !== 'https:' || !IMAGE_HOSTS.has(url.hostname.toLowerCase())) {
      throw new Error('Unsupported image host')
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    try {
      const response = await fetch(url, { signal: controller.signal, redirect: 'error' })
      const contentType = response.headers.get('content-type') ?? ''
      const length = Number(response.headers.get('content-length') ?? 0)
      if (!response.ok || !contentType.startsWith('image/') || length > 5_000_000) {
        throw new Error('Invalid image')
      }
      return new NextResponse(response.body, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    } finally {
      clearTimeout(timeout)
    }
  } catch {
    return new NextResponse(null, { status: 404 })
  }
}
