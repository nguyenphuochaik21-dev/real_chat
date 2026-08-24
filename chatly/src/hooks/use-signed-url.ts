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
    if (!urlOrPath) {
      setSignedUrl(null)
      return
    }

    let cancelled = false
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

    fetchUrl()

    return () => {
      cancelled = true
    }
  }, [urlOrPath, expiresIn])

  return { signedUrl, loading, error }
}
