import { createClient } from '@/lib/supabase/client'

const BUCKET_NAME = 'chat-media'

export type MediaType = 'image' | 'video' | 'audio' | 'file'

export interface UploadResult {
  url: string
  path: string
}

export interface MediaMetadata {
  name: string
  size: number
  mimeType: string
  type: MediaType
}

const FILE_SIZE_LIMIT = 50 * 1024 * 1024 // 50MB

const ALLOWED_MIME_TYPES: Record<MediaType, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  video: ['video/mp4', 'video/webm'],
  audio: ['audio/mpeg', 'audio/ogg', 'audio/wav'],
  file: [
    'application/pdf',
    'application/zip',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
  ],
}

export function getMediaType(mimeType: string): MediaType | null {
  for (const [type, mimes] of Object.entries(ALLOWED_MIME_TYPES)) {
    if (mimes.includes(mimeType)) {
      return type as MediaType
    }
  }
  return null
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function isValidMediaFile(file: File): { valid: boolean; error?: string } {
  if (file.size > FILE_SIZE_LIMIT) {
    return { valid: false, error: `File too large. Max size is ${formatFileSize(FILE_SIZE_LIMIT)}` }
  }

  const allAllowed = Object.values(ALLOWED_MIME_TYPES).flat()
  if (!allAllowed.includes(file.type)) {
    return { valid: false, error: 'File type not supported' }
  }

  return { valid: true }
}

/**
 * Create a signed URL for accessing private storage files.
 * Signed URLs expire after the specified duration.
 */
async function createSignedUrl(path: string, expiresIn = 3600): Promise<string> {
  const supabase = createClient()

  const { data, error } = await supabase.storage.from(BUCKET_NAME).createSignedUrl(path, expiresIn)

  if (error || !data) {
    throw new Error(`Failed to create signed URL: ${error?.message || 'Unknown error'}`)
  }

  return data.signedUrl
}

/**
 * Get signed URL from a public-style URL by extracting the path.
 * Returns a fresh signed URL that can be used to access the file.
 */
export async function getMediaUrl(urlOrPath: string, expiresIn = 3600): Promise<string> {
  const path = extractPathFromUrl(urlOrPath)
  if (!path) return urlOrPath
  return createSignedUrl(path, expiresIn)
}

/**
 * Extract the storage path from a URL or path.
 */
function extractPathFromUrl(urlOrPath: string): string | null {
  // If it's already a path (no http), return it
  if (!urlOrPath.startsWith('http')) {
    return urlOrPath
  }

  // Try to extract path from Supabase storage URL
  // Format: https://{project}.supabase.co/storage/v1/object/{public|sign}/{bucket}/{path}
  try {
    const url = new URL(urlOrPath)
    const match = url.pathname.match(
      /\/storage\/v1\/object\/(?:public|sign|authenticated)\/chat-media\/(.+)/
    )
    if (match) return decodeURIComponent(match[1])
  } catch {
    return null
  }

  return null
}

export async function downloadMedia(path: string, filename: string) {
  const url = await getMediaUrl(path)
  const response = await fetch(url)
  if (!response.ok) throw new Error('Download failed')
  const objectUrl = URL.createObjectURL(await response.blob())
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename.replace(/[\\/\x00-\x1f]/g, '_') || 'download'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
}

export async function uploadMedia(
  file: File,
  conversationId: string,
  userId: string
): Promise<UploadResult> {
  const supabase = createClient()

  // Generate unique filename
  const ext = file.name.split('.').pop() || ''
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const path = `${userId}/${conversationId}/${filename}`

  // Upload file
  const { data, error } = await supabase.storage.from(BUCKET_NAME).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })

  if (error) {
    throw new Error(`Upload failed: ${error.message}`)
  }

  // Create signed URL for the uploaded file (bucket is private)
  let signedUrl: string
  try {
    signedUrl = await createSignedUrl(data.path)
  } catch (error) {
    await supabase.storage
      .from(BUCKET_NAME)
      .remove([data.path])
      .catch(() => undefined)
    throw error
  }

  return {
    url: signedUrl,
    path: data.path,
  }
}

export function isImage(mimeType: string | null): boolean {
  return mimeType?.startsWith('image/') ?? false
}

export function isVideo(mimeType: string | null): boolean {
  return mimeType?.startsWith('video/') ?? false
}

export function isAudio(mimeType: string | null): boolean {
  return mimeType?.startsWith('audio/') ?? false
}
