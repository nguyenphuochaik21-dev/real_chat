'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { messageContentSchema, parseInput, uuidSchema } from '@/lib/actions/validation'
import type { Tables } from '@/types'

type ScheduledMessage = Tables<'scheduled_messages'>

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

const scheduledMessageSchema = z.object({
  conversationId: uuidSchema,
  content: messageContentSchema,
  contentType: z.enum(['text', 'image', 'video', 'audio', 'file']).default('text'),
  mediaUrl: z.string().max(1_024).nullable().optional(),
  mediaThumbnailUrl: z.string().max(1_024).nullable().optional(),
  mediaName: z.string().max(255).nullable().optional(),
  mediaSize: z
    .number()
    .int()
    .nonnegative()
    .max(50 * 1024 * 1024)
    .nullable()
    .optional(),
  mediaMimeType: z.string().max(100).nullable().optional(),
  replyTo: uuidSchema.nullable().optional(),
  scheduledAt: z.date(),
})

export async function createScheduledMessage(
  params: CreateScheduledMessageParams
): Promise<ScheduledMessageResult> {
  const input = parseInput(scheduledMessageSchema, params)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { success: false, error: 'Not authenticated' }

  const scheduledTime = input.scheduledAt.getTime()
  if (scheduledTime <= Date.now() || scheduledTime > Date.now() + 365 * 24 * 60 * 60 * 1000) {
    return { success: false, error: 'Scheduled time must be within the next year' }
  }

  const { data: participation } = await supabase
    .from('conversation_participants')
    .select('user_id')
    .eq('conversation_id', input.conversationId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!participation) {
    return { success: false, error: 'Not authorized to send messages to this conversation' }
  }

  if (input.replyTo) {
    const { data: reply } = await supabase
      .from('messages')
      .select('id')
      .eq('id', input.replyTo)
      .eq('conversation_id', input.conversationId)
      .maybeSingle()
    if (!reply) return { success: false, error: 'Reply message is invalid' }
  }

  const { data, error } = await supabase
    .from('scheduled_messages')
    .insert({
      conversation_id: input.conversationId,
      sender_id: user.id,
      content: input.content,
      content_type: input.contentType,
      media_url: input.mediaUrl ?? null,
      media_thumbnail_url: input.mediaThumbnailUrl ?? null,
      media_name: input.mediaName ?? null,
      media_size: input.mediaSize ?? null,
      media_mime_type: input.mediaMimeType ?? null,
      reply_to: input.replyTo ?? null,
      scheduled_at: input.scheduledAt.toISOString(),
      status: 'pending',
    })
    .select()
    .single()

  return error ? { success: false, error: error.message } : { success: true, message: data }
}
