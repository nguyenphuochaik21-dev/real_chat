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

export function supportedPreviewUrl(value: string | null): URL | null {
  if (!value || value.length > 2000) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' &&
      !url.port &&
      !url.username &&
      !url.password &&
      PREVIEW_HOSTS.has(url.hostname.toLowerCase())
      ? url
      : null
  } catch {
    return null
  }
}
