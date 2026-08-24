'use server'

import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types'

export type Conversation = Tables<'conversations'>
export type ConversationParticipant = Tables<'conversation_participants'>

interface ConversationWithParticipant extends Conversation {
  participant: Tables<'profiles'>
  last_message: Tables<'messages'>
  unread_count: number
  is_pinned: boolean
  is_muted: boolean
}

export async function getConversations(userId: string): Promise<ConversationWithParticipant[]> {
  const supabase = await createClient()

  // Get all conversations for this user
  const { data: participations, error: partError } = await supabase
    .from('conversation_participants')
    .select(`
      *,
      conversation:conversations(
        *,
        messages(
          id,
          content,
          sender_id,
          created_at,
          status
        )
      )
    `)
    .eq('user_id', userId)
    .order('last_read_at', { ascending: false })

  if (partError) throw new Error(partError.message)

  // Transform and get other participant's profile for each conversation
  const conversationsWithParticipants: ConversationWithParticipant[] = []

  for (const part of participations || []) {
    const conv = part.conversation
    if (!conv) continue

    // Get the other participant(s) in this conversation
    const { data: otherParticipants } = await supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conv.id)
      .neq('user_id', userId)

    const otherUserId = otherParticipants?.[0]?.user_id

    let participant = null
    if (otherUserId) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', otherUserId)
        .single()
      participant = data
    }

    // Get last message and unread count
    const { data: lastMessage } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    // Count unread messages
    const { count: unreadCount } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conv.id)
      .neq('sender_id', userId)
      .gt('created_at', part.last_read_at || '1970-01-01')

    if (participant && lastMessage) {
      conversationsWithParticipants.push({
        ...conv,
        participant,
        last_message: lastMessage,
        unread_count: unreadCount || 0,
        is_pinned: part.is_pinned,
        is_muted: part.is_muted,
      })
    }
  }

  // Sort: pinned first, then by last message time
  return conversationsWithParticipants.sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1
    if (!a.is_pinned && b.is_pinned) return 1
    const dateA = a.last_message?.created_at ? new Date(a.last_message.created_at).getTime() : 0
    const dateB = b.last_message?.created_at ? new Date(b.last_message.created_at).getTime() : 0
    return dateB - dateA
  })
}

export async function getConversation(conversationId: string): Promise<Conversation | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .single()

  if (error) return null
  return data
}

export async function createConversation(
  userId: string,
  otherUserId: string
): Promise<Conversation> {
  const supabase = await createClient()

  // Check if conversation already exists between these users
  const { data: existingConv } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', userId)

  for (const part of existingConv || []) {
    const { data: otherParts } = await supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', part.conversation_id)
      .eq('user_id', otherUserId)

    if (otherParts && otherParts.length > 0) {
      // Return existing conversation
      const { data: conv } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', part.conversation_id)
        .single()
      if (conv) return conv
    }
  }

  // Create new conversation
  const { data: newConv, error: convError } = await supabase
    .from('conversations')
    .insert({ created_by: userId })
    .select()
    .single()

  if (convError || !newConv) throw new Error('Failed to create conversation')

  // Add current user first
  await supabase.from('conversation_participants').insert({
    conversation_id: newConv.id,
    user_id: userId,
  })

  // Add the other participant via RPC
  await supabase.rpc('add_conversation_participant', {
    p_conversation_id: newConv.id,
    p_user_id: otherUserId,
  })

  return newConv
}

export async function togglePinned(
  conversationId: string,
  userId: string,
  isPinned: boolean
) {
  const supabase = await createClient()
  await supabase
    .from('conversation_participants')
    .update({ is_pinned: isPinned })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
}

export async function toggleMuted(
  conversationId: string,
  userId: string,
  isMuted: boolean
) {
  const supabase = await createClient()
  await supabase
    .from('conversation_participants')
    .update({ is_muted: isMuted })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
}

export async function markAsRead(conversationId: string, userId: string) {
  const supabase = await createClient()
  await supabase
    .from('conversation_participants')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
}
