'use server'

import { createClient } from '@/lib/supabase/server'
import { messageContentSchema, parseInput, uuidSchema } from '@/lib/actions/validation'
import type { Tables } from '@/types'
import { z } from 'zod'

type Message = Tables<'messages'>

const emojiSchema = z.string().trim().min(1).max(32)

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
  const id = parseInput(uuidSchema, messageId)
  const content = parseInput(messageContentSchema, newContent)
  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // Get existing message
  const { data: existing, error: fetchError } = await supabase
    .from('messages')
    .select('id, sender_id, created_at, conversation_id')
    .eq('id', id)
    .single()

  if (fetchError || !existing) {
    return { success: false, error: 'Message not found' }
  }

  // Verify ownership
  if (existing.sender_id !== user.id) {
    return { success: false, error: 'Not authorized to edit this message' }
  }

  // Check time constraint (15 minutes)
  if (!existing.created_at) {
    return { success: false, error: 'Message creation time is missing' }
  }

  const createdAt = new Date(existing.created_at)
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000)

  if (createdAt < fifteenMinutesAgo) {
    return { success: false, error: 'Messages can only be edited within 15 minutes' }
  }

  // Update message
  const { data, error } = await supabase
    .from('messages')
    .update({
      content,
      edited_at: new Date().toISOString(),
    })
    .eq('id', id)
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
  const id = parseInput(uuidSchema, messageId)
  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // Get existing message
  const { data: existing, error: fetchError } = await supabase
    .from('messages')
    .select('id, sender_id')
    .eq('id', id)
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
    .eq('id', id)

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
  const id = parseInput(uuidSchema, messageId)
  const targetIds = Array.from(
    new Set(parseInput(z.array(uuidSchema).min(1).max(20), targetConversationIds))
  )
  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // Get the original message
  const { data: originalMessage, error: fetchError } = await supabase
    .from('messages')
    .select(
      'id, conversation_id, content, content_type, media_url, media_thumbnail_url, media_name, media_size, media_mime_type'
    )
    .eq('id', id)
    .single()

  if (fetchError || !originalMessage) {
    return { success: false, error: 'Original message not found' }
  }

  if (!originalMessage.conversation_id) {
    return { success: false, error: 'Original message has no conversation' }
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
    .in('conversation_id', targetIds)

  const authorizedTargets = targetParticipations?.map((item) => item.conversation_id) || []
  const unauthorizedTargets = targetIds.filter((targetId) => !authorizedTargets.includes(targetId))

  if (unauthorizedTargets.length > 0) {
    return {
      success: false,
      error: `Not authorized to forward to ${unauthorizedTargets.length} conversation(s)`,
    }
  }

  // Insert forwarded messages
  const forwardedMessages = targetIds.map((convId) => ({
    conversation_id: convId,
    sender_id: user.id,
    content: originalMessage.content,
    content_type: originalMessage.content_type || 'text',
    media_url: originalMessage.media_url,
    media_thumbnail_url: originalMessage.media_thumbnail_url,
    media_name: originalMessage.media_name,
    media_size: originalMessage.media_size,
    media_mime_type: originalMessage.media_mime_type,
    status: 'sent' as const,
  }))

  const { error: insertError } = await supabase.from('messages').insert(forwardedMessages)

  if (insertError) {
    return { success: false, error: insertError.message }
  }

  // Update last_message_at for target conversations
  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .in('id', targetIds)

  return { success: true, forwardedCount: targetIds.length }
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
async function addReaction(
  messageId: string,
  emoji: string
): Promise<{ success: boolean; error?: string }> {
  const id = parseInput(uuidSchema, messageId)
  const reaction = parseInput(emojiSchema, emoji)
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const { error } = await supabase.from('message_reactions').insert({
    message_id: id,
    user_id: user.id,
    emoji: reaction,
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
async function removeReaction(
  messageId: string,
  emoji: string
): Promise<{ success: boolean; error?: string }> {
  const id = parseInput(uuidSchema, messageId)
  const reaction = parseInput(emojiSchema, emoji)
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const { error } = await supabase
    .from('message_reactions')
    .delete()
    .eq('message_id', id)
    .eq('user_id', user.id)
    .eq('emoji', reaction)

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
  const id = parseInput(uuidSchema, messageId)
  const reaction = parseInput(emojiSchema, emoji)
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, added: false, error: 'Not authenticated' }
  }

  // Check if reaction exists
  const { data: existing } = await supabase
    .from('message_reactions')
    .select('id')
    .eq('message_id', id)
    .eq('user_id', user.id)
    .eq('emoji', reaction)
    .single()

  if (existing) {
    const result = await removeReaction(id, reaction)
    return { ...result, added: false }
  } else {
    const result = await addReaction(id, reaction)
    return { ...result, added: true }
  }
}

/**
 * Get reactions for a message
 */
export async function getMessageReactions(messageId: string): Promise<MessageReaction[]> {
  const id = parseInput(uuidSchema, messageId)
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('message_reactions')
    .select('emoji, user_id')
    .eq('message_id', id)

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

/**
 * Get reactions for multiple messages at once (batch query)
 */
export async function getReactionsForMessages(
  messageIds: string[]
): Promise<Map<string, MessageReaction[]>> {
  if (messageIds.length === 0) return new Map()

  const ids = Array.from(new Set(parseInput(z.array(uuidSchema).max(200), messageIds)))

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('message_reactions')
    .select('emoji, user_id, message_id')
    .in('message_id', ids)

  if (error) {
    console.error('Failed to batch fetch reactions:', error)
    return new Map()
  }

  // Group by message_id then by emoji
  const result = new Map<string, MessageReaction[]>()

  // First pass: group by message_id
  const byMessage = new Map<string, { emoji: string; user_id: string }[]>()
  for (const r of data || []) {
    if (!byMessage.has(r.message_id)) {
      byMessage.set(r.message_id, [])
    }
    byMessage.get(r.message_id)!.push(r)
  }

  // Second pass: aggregate each message's reactions
  for (const [msgId, reactions] of byMessage) {
    const reactionMap = new Map<string, { count: number; userReacted: boolean }>()

    for (const r of reactions) {
      const existing = reactionMap.get(r.emoji) || { count: 0, userReacted: false }
      existing.count++
      if (user && r.user_id === user.id) {
        existing.userReacted = true
      }
      reactionMap.set(r.emoji, existing)
    }

    result.set(
      msgId,
      Array.from(reactionMap.entries()).map(([emoji, stats]) => ({
        emoji,
        count: stats.count,
        userReacted: stats.userReacted,
      }))
    )
  }

  return result
}
