'use client'

import { useCallback, useEffect, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { useFriendshipStore } from '@/stores/friendship-store'

const RECONCILE_INTERVAL_MS = 30_000

export function useFriendshipsRealtime(userId: string | null) {
  const [supabase] = useState(() => createClient())
  const setIncomingCount = useFriendshipStore((state) => state.setIncomingCount)
  const signalChange = useFriendshipStore((state) => state.signalChange)
  const reset = useFriendshipStore((state) => state.reset)

  const refreshIncomingCount = useCallback(async () => {
    if (!userId) return
    const { count, error } = await supabase
      .from('friendships')
      .select('*', { count: 'exact', head: true })
      .eq('addressee_id', userId)
      .eq('status', 'pending')

    if (!error) setIncomingCount(count ?? 0)
  }, [setIncomingCount, supabase, userId])

  useEffect(() => {
    if (!userId) {
      reset()
      return
    }

    let mounted = true
    let channel: RealtimeChannel | null = null

    const handleChange = () => {
      if (!mounted) return
      signalChange()
      void refreshIncomingCount()
    }

    const setup = async () => {
      await refreshIncomingCount()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!mounted) return
      if (session?.access_token) supabase.realtime.setAuth(session.access_token)

      channel = supabase.channel(`friendships:${userId}`, { config: { private: true } })
      for (const event of ['INSERT', 'UPDATE', 'DELETE']) {
        channel.on('broadcast', { event }, handleChange)
      }
      channel.subscribe()
    }

    const reconcile = () => {
      if (document.visibilityState === 'visible') void refreshIncomingCount()
    }
    const intervalId = window.setInterval(reconcile, RECONCILE_INTERVAL_MS)
    window.addEventListener('focus', reconcile)
    document.addEventListener('visibilitychange', reconcile)
    void setup()

    return () => {
      mounted = false
      window.clearInterval(intervalId)
      window.removeEventListener('focus', reconcile)
      document.removeEventListener('visibilitychange', reconcile)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [refreshIncomingCount, reset, signalChange, supabase, userId])
}
