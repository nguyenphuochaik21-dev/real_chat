'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

const HEARTBEAT_INTERVAL_MS = 25_000

export function usePresence(userId: string | null) {
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    if (!userId) return

    const supabase = supabaseRef.current
    const updateStatus = (status: 'online' | 'offline' | 'away') => {
      void supabase.rpc(`set_user_${status}`).then(() => undefined)
    }
    const handleVisibilityChange = () => {
      updateStatus(document.visibilityState === 'visible' ? 'online' : 'away')
    }
    const handlePageHide = () => updateStatus('offline')

    updateStatus('online')
    const heartbeatId = window.setInterval(() => {
      if (document.visibilityState === 'visible') updateStatus('online')
    }, HEARTBEAT_INTERVAL_MS)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      window.clearInterval(heartbeatId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
      updateStatus('offline')
    }
  }, [userId])
}
