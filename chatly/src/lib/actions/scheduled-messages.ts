'use server'

import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types'

type ScheduledMessage = Tables<'scheduled_messages'>
type ParticipantProfile = Pick<Tables<'profiles'>, 'display_name'>

interface ScheduledConversationParticipant {
  user_id: string
  profile: ParticipantProfile[] | ParticipantProfile | null
}

interface ScheduledConversationRow {
  title: string | null
  conversation_participants: ScheduledConversationParticipant[]
}

type ScheduledMessageQueryRow = ScheduledMessage & {
  conversation: ScheduledConversationRow[] | ScheduledConversationRow | null
}

export interface ScheduledMessageWithConversation extends ScheduledMessage {
  conversation?: {
    title: string | null
    participant?: {
      display_name: string
    }
  }
}

export interface CreateScheduledMessageParams {
  conversationId: string
  content: string
  contentType?: string
  mediaUrl?: string | null
  mediaThumbnailUrl?: string | null
  mediaName?: string | null
  mediaSize?: number | null
  mediaMimeType?: string | null
  replyTo?: string | null
  scheduledAt: Date
}

export interface ScheduledMessageResult {
  success: boolean
  message?: ScheduledMessage
  error?: string
}

/**
 * Create a scheduled message
 */
export async function createScheduledMessage(
  params: CreateScheduledMessageParams
): Promise<ScheduledMessageResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // Verify user is participant of the conversation
  const { data: participation } = await supabase
    .from('conversation_participants')
    .select('user_id')
    .eq('conversation_id', params.conversationId)
    .eq('user_id', user.id)
    .single()

  if (!participation) {
    return { success: false, error: 'Not authorized to send messages to this conversation' }
  }

  // Validate scheduled time is in the future
  if (new Date(params.scheduledAt) <= new Date()) {
    return { success: false, error: 'Scheduled time must be in the future' }
  }

  const { data, error } = await supabase
    .from('scheduled_messages')
    .insert({
      conversation_id: params.conversationId,
      sender_id: user.id,
      content: params.content,
      content_type: params.contentType || 'text',
      media_url: params.mediaUrl || null,
      media_thumbnail_url: params.mediaThumbnailUrl || null,
      media_name: params.mediaName || null,
      media_size: params.mediaSize || null,
      media_mime_type: params.mediaMimeType || null,
      reply_to: params.replyTo || null,
      scheduled_at: params.scheduledAt.toISOString(),
      status: 'pending',
    })
    .select()
    .single()

  if (error) {
    console.error('Failed to create scheduled message:', error)
    return { success: false, error: error.message }
  }

  return { success: true, message: data }
}

/**
 * Cancel a scheduled message
 */
export async function cancelScheduledMessage(
  messageId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // Verify ownership
  const { data: existing } = await supabase
    .from('scheduled_messages')
    .select('id, sender_id')
    .eq('id', messageId)
    .single()

  if (!existing) {
    return { success: false, error: 'Scheduled message not found' }
  }

  if (existing.sender_id !== user.id) {
    return { success: false, error: 'Not authorized to cancel this scheduled message' }
  }

  if (existing.sender_id !== user.id) {
    return { success: false, error: 'Not authorized to cancel this message' }
  }

  const { error } = await supabase
    .from('scheduled_messages')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', messageId)

  if (error) {
    console.error('Failed to cancel scheduled message:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Get all scheduled messages for the current user
 */
export async function getScheduledMessages(): Promise<{
  success: boolean
  messages?: ScheduledMessageWithConversation[]
  error?: string
}> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const { data, error } = await supabase
    .from('scheduled_messages')
    .select(
      `
      *,
      conversation:conversations(
        id,
        title,
        type,
        conversation_participants(
          user_id,
          profile:profiles(display_name)
        )
      )
    `
    )
    .eq('sender_id', user.id)
    .in('status', ['pending', 'sent'])
    .order('scheduled_at', { ascending: true })

  if (error) {
    console.error('Failed to fetch scheduled messages:', error)
    return { success: false, error: error.message }
  }

  // Transform the data to include conversation info
  const rows = (data || []) as unknown as ScheduledMessageQueryRow[]
  const messages: ScheduledMessageWithConversation[] = rows.map((msg) => {
    const conversation = Array.isArray(msg.conversation) ? msg.conversation[0] : msg.conversation

    // Get the other participant for direct messages
    const otherParticipant = conversation?.conversation_participants.find(
      (participant) => participant.user_id !== user.id
    )
    const participantProfile = Array.isArray(otherParticipant?.profile)
      ? otherParticipant.profile[0]
      : otherParticipant?.profile

    return {
      ...msg,
      conversation: {
        title: conversation?.title || participantProfile?.display_name || 'Unknown',
        participant: participantProfile ?? undefined,
      },
    }
  })

  return { success: true, messages }
}

/**
 * Get scheduled messages for a specific conversation
 */
export async function getScheduledMessagesForConversation(conversationId: string): Promise<{
  success: boolean
  messages?: ScheduledMessage[]
  error?: string
}> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const { data, error } = await supabase
    .from('scheduled_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('sender_id', user.id)
    .eq('status', 'pending')
    .order('scheduled_at', { ascending: true })

  if (error) {
    console.error('Failed to fetch scheduled messages:', error)
    return { success: false, error: error.message }
  }

  return { success: true, messages: data || [] }
}

/**
 * Send a scheduled message immediately (triggers the database function)
 */
export async function sendScheduledMessageNow(
  messageId: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // Verify ownership
  const { data: existing } = await supabase
    .from('scheduled_messages')
    .select('id, sender_id')
    .eq('id', messageId)
    .single()

  if (!existing) {
    return { success: false, error: 'Scheduled message not found' }
  }

  if (existing.sender_id !== user.id) {
    return { success: false, error: 'Not authorized to send this message' }
  }

  // Call the database function to send the message
  const { data, error } = await supabase.rpc('send_scheduled_message', {
    scheduled_message_id: messageId,
  })

  if (error) {
    console.error('Failed to send scheduled message:', error)
    return { success: false, error: error.message }
  }

  return { success: true, messageId: data }
}
