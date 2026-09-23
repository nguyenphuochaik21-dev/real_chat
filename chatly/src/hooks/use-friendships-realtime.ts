'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { useFriendshipStore } from '@/stores/friendship-store'
import { getFriendshipOverview } from '@/lib/actions/friendships'
import { useNotificationStore } from '@/stores/notification-store'
import { useI18n } from '@/lib/i18n'

const RECONCILE_INTERVAL_MS = 30_000
const OVERVIEW_CACHE_STALE_MS = 60_000

export function useFriendshipsRealtime(userId: string | null) {
  const { t } = useI18n()
  const [supabase] = useState(() => createClient())
  const setIncomingCount = useFriendshipStore((state) => state.setIncomingCount)
  const reset = useFriendshipStore((state) => state.reset)
  const addNotification = useNotificationStore((state) => state.addNotification)
  const notifiedRef = useRef(new Map<string, number>())

  const preloadOverview = useCallback(async (force = false) => {
    const store = useFriendshipStore.getState()
    if (
      !force &&
      store.overview &&
      Date.now() - store.overviewFetchedAt < OVERVIEW_CACHE_STALE_MS
    ) {
      return
    }
    try {
      const result = await getFriendshipOverview()
      if (result.data) {
        store.setOverview(result.data)
        return result.data
      }
    } catch {
      // The contacts page can retry and surface an error if preloading fails.
    }
  }, [])

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

    const handleChange = async () => {
      if (!mounted) return
      const previous = useFriendshipStore.getState().overview
      const next = await preloadOverview(true)
      if (!next) {
        void refreshIncomingCount()
        useFriendshipStore.getState().signalChange()
      }
      if (!mounted || !previous || !next) return
      const incomingIds = new Set(previous.incoming.map((item) => item.id))
      for (const item of next.incoming) {
        if (incomingIds.has(item.id)) continue
        const notificationKey = `request:${item.id}`
        const lastNotifiedAt = notifiedRef.current.get(notificationKey) ?? 0
        if (Date.now() - lastNotifiedAt < 10_000) continue
        notifiedRef.current.set(notificationKey, Date.now())
        addNotification({
          type: 'system',
          title: t('friends.requestNotification', { name: item.profile.display_name }),
          body: '',
          url: '/contacts',
        })
      }
      const friendIds = new Set(previous.friends.map((item) => item.id))
      const outgoingIds = new Set(previous.outgoing.map((item) => item.id))
      for (const item of next.friends) {
        if (friendIds.has(item.id) || !outgoingIds.has(item.id)) continue
        const notificationKey = `accepted:${item.id}`
        const lastNotifiedAt = notifiedRef.current.get(notificationKey) ?? 0
        if (Date.now() - lastNotifiedAt < 10_000) continue
        notifiedRef.current.set(notificationKey, Date.now())
        addNotification({
          type: 'system',
          title: t('friends.acceptedNotification', { name: item.profile.display_name }),
          body: '',
          url: '/contacts',
        })
      }
    }

    const setup = async () => {
      await Promise.all([refreshIncomingCount(), preloadOverview()])
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!mounted) return
      if (session?.access_token) supabase.realtime.setAuth(session.access_token)

      channel = supabase.channel(`friendships:${userId}`, { config: { private: true } })
      for (const event of ['INSERT', 'UPDATE', 'DELETE']) {
        channel.on('broadcast', { event }, () => void handleChange())
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
  }, [addNotification, preloadOverview, refreshIncomingCount, reset, supabase, t, userId])
}
