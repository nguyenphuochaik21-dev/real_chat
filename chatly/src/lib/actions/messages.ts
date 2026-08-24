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

// ============================================================================
// Message Features: Edit, Delete, Forward, Reactions, Star
// ============================================================================

/**
 * Edit a message (within 15 minutes)
 */
export async function editMessage(
  messageId: string,
  newContent: string
): Promise<{ success: boolean; message?: Message; error?: string }> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // Get existing message
  const { data: existing, error: fetchError } = await supabase
    .from('messages')
    .select('id, sender_id, created_at, conversation_id')
    .eq('id', messageId)
    .single()

  if (fetchError || !existing) {
    return { success: false, error: 'Message not found' }
  }

  // Verify ownership
  if (existing.sender_id !== user.id) {
    return { success: false, error: 'Not authorized to edit this message' }
  }

  // Check time constraint (15 minutes)
  const createdAt = new Date(existing.created_at)
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000)

  if (createdAt < fifteenMinutesAgo) {
    return { success: false, error: 'Messages can only be edited within 15 minutes' }
  }

  // Update message
  const { data, error } = await supabase
    .from('messages')
    .update({
      content: newContent,
      edited_at: new Date().toISOString()
    })
    .eq('id', messageId)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, message: data }
}

/**
 * Soft-delete a message (sets deleted_at timestamp)
 */
export async function deleteMessage(
  messageId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // Get existing message
  const { data: existing, error: fetchError } = await supabase
    .from('messages')
    .select('id, sender_id')
    .eq('id', messageId)
    .single()

  if (fetchError || !existing) {
    return { success: false, error: 'Message not found' }
  }

  // Verify ownership
  if (existing.sender_id !== user.id) {
    return { success: false, error: 'Not authorized to delete this message' }
  }

  // Soft delete
  const { error } = await supabase
    .from('messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Forward a message to one or more conversations
 */
export async function forwardMessage(
  messageId: string,
  targetConversationIds: string[]
): Promise<{ success: boolean; forwardedCount?: number; error?: string }> {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // Get the original message
  const { data: originalMessage, error: fetchError } = await supabase
    .from('messages')
    .select('*')
    .eq('id', messageId)
    .single()

  if (fetchError || !originalMessage) {
    return { success: false, error: 'Original message not found' }
  }

  // Verify user is participant of the source conversation
  const { data: participation } = await supabase
    .from('conversation_participants')
    .select('user_id')
    .eq('conversation_id', originalMessage.conversation_id)
    .eq('user_id', user.id)
    .single()

  if (!participation) {
    return { success: false, error: 'Not authorized to forward this message' }
  }

  // Verify user is participant of all target conversations
  const { data: targetParticipations } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', user.id)
    .in('conversation_id', targetConversationIds)

  const authorizedTargets = targetParticipations?.map(p => p.conversation_id) || []
  const unauthorizedTargets = targetConversationIds.filter(
    id => !authorizedTargets.includes(id)
  )

  if (unauthorizedTargets.length > 0) {
    return {
      success: false,
      error: `Not authorized to forward to ${unauthorizedTargets.length} conversation(s)`
    }
  }

  // Insert forwarded messages
  const forwardedMessages = targetConversationIds.map(convId => ({
    conversation_id: convId,
    sender_id: user.id,
    content: originalMessage.content,
    content_type: originalMessage.content_type || 'text',
    media_url: originalMessage.media_url,
    media_thumbnail_url: originalMessage.media_thumbnail_url,
    media_name: originalMessage.media_name,
    media_size: originalMessage.media_size,
    media_mime_type: originalMessage.media_mime_type,
    status: 'sent',
  }))

  const { error: insertError } = await supabase
    .from('messages')
    .insert(forwardedMessages)

  if (insertError) {
    return { success: false, error: insertError.message }
  }

  // Update last_message_at for target conversations
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .in('id', targetConversationIds)

  return { success: true, forwardedCount: targetConversationIds.length }
}

// ============================================================================
// Reactions
// ============================================================================

export interface MessageReaction {
  emoji: string
  count: number
  userReacted: boolean
}

/**
 * Add a reaction to a message
 */
export async function addReaction(
  messageId: string,
  emoji: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const { error } = await supabase
    .from('message_reactions')
    .insert({
      message_id: messageId,
      user_id: user.id,
      emoji,
    })

  // Ignore unique constraint violation (already reacted)
  if (error && error.code !== '23505') {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Remove a reaction from a message
 */
export async function removeReaction(
  messageId: string,
  emoji: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const { error } = await supabase
    .from('message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', user.id)
    .eq('emoji', emoji)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Toggle a reaction on a message
 */
export async function toggleReaction(
  messageId: string,
  emoji: string
): Promise<{ success: boolean; added: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, added: false, error: 'Not authenticated' }
  }

  // Check if reaction exists
  const { data: existing } = await supabase
    .from('message_reactions')
    .select('id')
    .eq('message_id', messageId)
    .eq('user_id', user.id)
    .eq('emoji', emoji)
    .single()

  if (existing) {
    const result = await removeReaction(messageId, emoji)
    return { ...result, added: false }
  } else {
    const result = await addReaction(messageId, emoji)
    return { ...result, added: true }
  }
}

/**
 * Get reactions for a message
 */
export async function getMessageReactions(
  messageId: string
): Promise<MessageReaction[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('message_reactions')
    .select('emoji, user_id')
    .eq('message_id', messageId)

  if (error) {
    console.error('Failed to fetch reactions:', error)
    return []
  }

  // Group by emoji and count
  const reactionMap = new Map<string, { count: number; userReacted: boolean }>()

  for (const r of data || []) {
    const existing = reactionMap.get(r.emoji) || { count: 0, userReacted: false }
    existing.count++
    if (user && r.user_id === user.id) {
      existing.userReacted = true
    }
    reactionMap.set(r.emoji, existing)
  }

  return Array.from(reactionMap.entries()).map(([emoji, stats]) => ({
    emoji,
    count: stats.count,
    userReacted: stats.userReacted,
  }))
}

// ============================================================================
// Starred Messages
// ============================================================================

/**
 * Star a message
 */
export async function starMessage(
  messageId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const { error } = await supabase
    .from('starred_messages')
    .insert({
      message_id: messageId,
      user_id: user.id,
    })

  // Ignore unique constraint violation (already starred)
  if (error && error.code !== '23505') {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Unstar a message
 */
export async function unstarMessage(
  messageId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const { error } = await supabase
    .from('starred_messages')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', user.id)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Toggle star status of a message
 */
export async function toggleStar(
  messageId: string
): Promise<{ success: boolean; starred: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, starred: false, error: 'Not authenticated' }
  }

  // Check if starred
  const { data: existing } = await supabase
    .from('starred_messages')
    .select('id')
    .eq('message_id', messageId)
    .eq('user_id', user.id)
    .single()

  if (existing) {
    const result = await unstarMessage(messageId)
    return { ...result, starred: false }
  } else {
    const result = await starMessage(messageId)
    return { ...result, starred: true }
  }
}

/**
 * Get all starred messages for the current user
 */
export async function getStarredMessages(
  limit = 50,
  offset = 0
): Promise<(Message & { conversation_title?: string })[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Not authenticated')
  }

  const { data, error } = await supabase
    .from('starred_messages')
    .select(`
      id,
      created_at,
      message:messages(
        *,
        conversation:conversations(title)
      )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('Failed to fetch starred messages:', error)
    throw new Error(error.message)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data || []).map((item: any) => {
    const message = item.message
    if (!message) return null
    return {
      ...message,
      conversation_title: message.conversation?.title,
    }
  }).filter(Boolean) as (Message & { conversation_title?: string })[]
}
