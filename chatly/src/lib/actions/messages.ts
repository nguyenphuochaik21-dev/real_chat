'use server'

import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types'

export type Message = Tables<'messages'>

export async function getMessages(
  conversationId: string,
  limit = 50,
  offset = 0
): Promise<Message[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .range(offset, offset + limit - 1)

  if (error) throw new Error(error.message)
  return data || []
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  content: string
): Promise<Message> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      content,
      status: 'sent',
    })
    .select()
    .single()

  if (error) throw new Error(error.message)

  // Update conversation's last_message_at
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId)

  return data
}

export async function updateMessageStatus(
  messageId: string,
  status: 'sent' | 'delivered' | 'read'
) {
  const supabase = await createClient()
  await supabase
    .from('messages')
    .update({ status })
    .eq('id', messageId)
}

export async function markMessagesAsRead(
  conversationId: string,
  readerId: string,
  senderId: string
) {
  const supabase = await createClient()

  // Get unread messages from sender
  const { data: unreadMessages } = await supabase
    .from('messages')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('sender_id', senderId)
    .neq('status', 'read')

  if (unreadMessages && unreadMessages.length > 0) {
    // Mark them as read
    await supabase
      .from('messages')
      .update({ status: 'read' })
      .in('id', unreadMessages.map(m => m.id))
  }
}
