import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const IMAGE_HOSTS = new Set([
  'i.ytimg.com',
  'img.youtube.com',
  'i.vimeocdn.com',
  'avatars.githubusercontent.com',
  'opengraph.githubassets.com',
])
const MAX_IMAGE_BYTES = 5_000_000

async function readLimitedBody(
  body: ReadableStream<Uint8Array> | null,
  limit: number
): Promise<ArrayBuffer> {
  if (!body) throw new Error('Missing image body')

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > limit) {
        await reader.cancel()
        throw new Error('Image is too large')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const result = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result.buffer
}

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
      const lengthHeader = response.headers.get('content-length')
      const length = lengthHeader ? Number(lengthHeader) : null
      if (
        !response.ok ||
        !contentType.startsWith('image/') ||
        (length !== null &&
          (!Number.isSafeInteger(length) || length < 0 || length > MAX_IMAGE_BYTES))
      ) {
        throw new Error('Invalid image')
      }
      const body = await readLimitedBody(response.body, MAX_IMAGE_BYTES)
      return new NextResponse(body, {
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
