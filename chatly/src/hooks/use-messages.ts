'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/types'

export type Message = Tables<'messages'>

export function useMessages(conversationId: string | null, userId: string | null) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const fetchMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })

      if (msgError) throw msgError
      setMessages(data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch messages')
    } finally {
      setLoading(false)
    }
  }, [conversationId, supabase])

  const sendMessage = useCallback(
    async (content: string): Promise<Message | null> => {
      if (!conversationId || !userId || !content.trim()) return null

      try {
        const { data, error: sendError } = await supabase
          .from('messages')
          .insert({
            conversation_id: conversationId,
            sender_id: userId,
            content: content.trim(),
            status: 'sent',
          })
          .select()
          .single()

        if (sendError) throw sendError

        // Update conversation's last_message_at
        await supabase
          .from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', conversationId)

        return data
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send message')
        return null
      }
    },
    [conversationId, userId, supabase]
  )

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void fetchMessages(), 0)

    // Subscribe to real-time messages
    if (!conversationId) return () => window.clearTimeout(timeoutId)

    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMessage = payload.new as Message
          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some((m) => m.id === newMessage.id)) return prev
            return [...prev, newMessage]
          })
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updatedMessage = payload.new as Message
          setMessages((prev) => prev.map((m) => (m.id === updatedMessage.id ? updatedMessage : m)))
        }
      )
      .subscribe()

    return () => {
      window.clearTimeout(timeoutId)
      supabase.removeChannel(channel)
    }
  }, [conversationId, fetchMessages, supabase])

  return { messages, loading, error, sendMessage, refetch: fetchMessages }
}
