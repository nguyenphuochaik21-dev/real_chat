'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

const TYPING_TIMEOUT = 3000 // 3 seconds of inactivity before stopping

export function useTyping(conversationId: string | null, currentUserId: string | null) {
  const [typingUserIds, setTypingUserIds] = useState<string[]>([])
  const [isCurrentlyTyping, setIsCurrentlyTyping] = useState(false)
  const stopTypingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const supabase = createClient()

  // Stop typing and clean up database row
  const stopTyping = useCallback(async () => {
    if (!conversationId || !currentUserId) return
    setIsCurrentlyTyping(false)

    // Delete our typing indicator
    try {
      await supabase
        .from('typing_indicators')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('user_id', currentUserId)
    } catch (err) {
      console.error('Failed to clear typing indicator:', err)
    }

    if (stopTypingTimeoutRef.current) {
      clearTimeout(stopTypingTimeoutRef.current)
      stopTypingTimeoutRef.current = null
    }
  }, [conversationId, currentUserId, supabase])

  // Start typing - upsert indicator in database
  const startTyping = useCallback(async () => {
    if (!conversationId || !currentUserId) return

    setIsCurrentlyTyping(true)

    // Upsert typing indicator (insert or update)
    try {
      await supabase
        .from('typing_indicators')
        .upsert({
          conversation_id: conversationId,
          user_id: currentUserId,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'conversation_id,user_id',
        })
    } catch (err) {
      console.error('Failed to upsert typing indicator:', err)
    }

    // Auto-stop after timeout
    if (stopTypingTimeoutRef.current) {
      clearTimeout(stopTypingTimeoutRef.current)
    }

    stopTypingTimeoutRef.current = setTimeout(() => {
      stopTyping()
    }, TYPING_TIMEOUT)
  }, [conversationId, currentUserId, supabase, stopTyping])

  // Called on each keystroke
  const onType = useCallback(() => {
    startTyping()
  }, [startTyping])

  // Subscribe to typing indicators for this conversation
  useEffect(() => {
    if (!conversationId || !currentUserId) return

    // Fetch initial typing indicators
    const fetchTyping = async () => {
      try {
        const cutoff = new Date(Date.now() - TYPING_TIMEOUT).toISOString()
        const { data } = await supabase
          .from('typing_indicators')
          .select('user_id')
          .eq('conversation_id', conversationId)
          .neq('user_id', currentUserId)
          .gt('updated_at', cutoff)

        setTypingUserIds(data?.map(d => d.user_id) || [])
      } catch (err) {
        console.error('Failed to fetch typing indicators:', err)
      }
    }

    fetchTyping()

    // Subscribe to changes
    const channel = supabase
      .channel(`typing-${conversationId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'typing_indicators',
        filter: `conversation_id=eq.${conversationId}`,
      }, () => {
        fetchTyping()
      })
      .subscribe()

    // Cleanup old entries periodically
    const cleanupInterval = setInterval(() => {
      fetchTyping()
    }, 5000)

    return () => {
      clearInterval(cleanupInterval)
      // Stop our own typing indicator
      stopTyping()
      supabase.removeChannel(channel)
    }
  }, [conversationId, currentUserId, supabase, stopTyping])

  return {
    typingUserIds,
    isCurrentlyTyping,
    isSomeoneTyping: typingUserIds.length > 0,
    startTyping,
    stopTyping,
    onType,
    getTypingUserIds: () => typingUserIds,
  }
}