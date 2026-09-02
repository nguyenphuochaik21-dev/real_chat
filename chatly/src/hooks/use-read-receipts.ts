'use client'

import { useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

// Track which messages the current user has read (by other users)
export function useReadReceipts(conversationId: string | null, currentUserId: string | null) {
  const supabase = createClient()

  // Mark messages as read when opening a conversation
  const markAsRead = useCallback(async () => {
    if (!conversationId || !currentUserId) return

    const { error } = await supabase.rpc('mark_conversation_read', {
      p_conversation_id: conversationId,
    })

    if (!error) return

    // Keep older deployments working until the hardening migration is applied.
    if (error.code === 'PGRST202' || error.message.includes('schema cache')) {
      const { error: fallbackError } = await supabase
        .from('conversation_participants')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('user_id', currentUserId)

      if (fallbackError) {
        console.warn('Unable to update the read timestamp:', fallbackError.message)
      }
      return
    }

    console.warn('Unable to mark the conversation as read:', error.message)
  }, [conversationId, currentUserId, supabase])

  return { markAsRead }
}
