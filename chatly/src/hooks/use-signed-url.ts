'use client'

import { useEffect, useState } from 'react'
import { getMediaUrl } from '@/lib/supabase/storage'

/**
 * Hook to get a signed URL for media files.
 * Automatically refreshes when the URL changes.
 */
export function useSignedUrl(urlOrPath: string | null | undefined, expiresIn = 3600) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    if (!urlOrPath) {
      const timeoutId = window.setTimeout(() => setSignedUrl(null), 0)
      return () => window.clearTimeout(timeoutId)
    }

    const fetchUrl = async () => {
      setLoading(true)
      setError(null)
      try {
        const url = await getMediaUrl(urlOrPath, expiresIn)
        if (!cancelled) {
          setSignedUrl(url)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load media')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    const timeoutId = window.setTimeout(() => void fetchUrl(), 0)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [urlOrPath, expiresIn])

  return { signedUrl, loading, error }
}
