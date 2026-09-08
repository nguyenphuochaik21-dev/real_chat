'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { parseConversationSummaries } from '@/lib/conversation-summary'
import { useNavigationBadgesStore } from '@/stores/navigation-badges-store'

const RECONCILE_INTERVAL_MS = 120_000
const REFRESH_DEBOUNCE_MS = 120

export function useNavigationBadges(userId: string | null) {
  const [supabase] = useState(() => createClient())
  const refreshTimerRef = useRef<number | null>(null)
  const setUnreadMessages = useNavigationBadgesStore((state) => state.setUnreadMessages)
  const reset = useNavigationBadgesStore((state) => state.reset)

  const refresh = useCallback(async () => {
    if (!userId) return
    const { data, error } = await supabase.rpc('get_unread_message_count')
    if (!error) {
      setUnreadMessages(Number(data) || 0)
      return
    }

    const isMissingMigration =
      error.code === 'PGRST202' ||
      error.code === '42883' ||
      error.message.includes('get_unread_message_count')
    if (!isMissingMigration) return

    const fallback = await supabase.rpc('get_conversation_summaries')
    if (fallback.error) return
    const total = parseConversationSummaries(fallback.data)
      .filter((conversation) => !conversation.is_archived)
      .reduce((sum, conversation) => sum + conversation.unread_count, 0)
    setUnreadMessages(total)
  }, [setUnreadMessages, supabase, userId])

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null
      void refresh()
    }, REFRESH_DEBOUNCE_MS)
  }, [refresh])

  useEffect(() => {
    if (!userId) {
      reset()
      return
    }

    let mounted = true
    let channel: RealtimeChannel | null = null

    const setup = async () => {
      await refresh()
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!mounted) return
      if (session?.access_token) supabase.realtime.setAuth(session.access_token)

      channel = supabase
        .channel(`navigation-badges:${userId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          scheduleRefresh
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'conversation_participants',
            filter: `user_id=eq.${userId}`,
          },
          scheduleRefresh
        )
      channel.subscribe()
    }

    const reconcile = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const intervalId = window.setInterval(reconcile, RECONCILE_INTERVAL_MS)
    window.addEventListener('focus', reconcile)
    document.addEventListener('visibilitychange', reconcile)
    void setup()

    return () => {
      mounted = false
      if (refreshTimerRef.current !== null) window.clearTimeout(refreshTimerRef.current)
      window.clearInterval(intervalId)
      window.removeEventListener('focus', reconcile)
      document.removeEventListener('visibilitychange', reconcile)
      if (channel) void supabase.removeChannel(channel)
    }
  }, [refresh, reset, scheduleRefresh, supabase, userId])
}
