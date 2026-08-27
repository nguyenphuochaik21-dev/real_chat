'use client'

import { useEffect, useRef, useCallback } from 'react'
import { useAuth } from './use-auth'
import { createClient } from '@/lib/supabase/client'
import { getScheduledMessages } from '@/lib/actions/scheduled-messages'

// Singleton supabase client
const supabase = createClient()

/**
 * Automatically process scheduled messages that are due.
 * Runs every 30 seconds to check for due messages and trigger the
 * send_scheduled_message RPC.
 *
 * This hook does NOT subscribe to realtime (avoids duplicate channel issue).
 * It fetches fresh data on each interval to avoid stale state.
 */
export function useScheduledMessagesProcessor() {
  const { user } = useAuth()
  const processingRef = useRef(false)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const processDueMessages = useCallback(async () => {
    if (!user || processingRef.current) return
    processingRef.current = true

    try {
      // Fetch fresh data (don't rely on state - it's stale)
      const result = await getScheduledMessages()
      if (!result.success || !result.messages) return

      const now = new Date()
      const dueMessages = result.messages.filter(
        (msg) =>
          msg.status === 'pending' &&
          msg.scheduled_at &&
          new Date(msg.scheduled_at) <= now
      )

      if (dueMessages.length === 0) return

      console.log(`[ScheduledProcessor] Found ${dueMessages.length} due messages`)

      for (const msg of dueMessages) {
        const { error } = await supabase.rpc('send_scheduled_message', {
          scheduled_message_id: msg.id,
        })

        if (error) {
          console.error('[ScheduledProcessor] Failed to send:', msg.id, error)
        } else {
          console.log('[ScheduledProcessor] Sent:', msg.id)
        }
      }
    } catch (err) {
      console.error('[ScheduledProcessor] Error:', err)
    } finally {
      processingRef.current = false
    }
  }, [user])

  useEffect(() => {
    if (!user) return

    // Process immediately on mount
    processDueMessages()

    // Then check every 30 seconds
    intervalRef.current = setInterval(processDueMessages, 30 * 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [user, processDueMessages])

  return null
}