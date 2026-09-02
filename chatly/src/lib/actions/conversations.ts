'use server'

import { createClient } from '@/lib/supabase/server'
import { parseInput, uuidSchema } from '@/lib/actions/validation'
import type { Tables } from '@/types'
import { parseConversationSummaries } from '@/lib/conversation-summary'

export type Conversation = Tables<'conversations'>

async function getAuthenticatedClient() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('Authentication required')
  return { supabase, user }
}

export async function createConversation(otherUserId: string): Promise<Conversation> {
  const targetUserId = parseInput(uuidSchema, otherUserId)
  const { supabase, user } = await getAuthenticatedClient()

  if (targetUserId === user.id) throw new Error('Select another user')

  const { data: rpcConversationId, error } = await supabase.rpc(
    'get_or_create_direct_conversation',
    { p_other_user_id: targetUserId }
  )

  let conversationId = rpcConversationId

  if (error && (error.code === 'PGRST202' || error.message.includes('schema cache'))) {
    conversationId = await createConversationLegacy(supabase, user.id, targetUserId)
  } else if (error || !conversationId) {
    throw new Error(error?.message || 'Failed to create conversation')
  }

  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .single()

  if (conversationError || !conversation) {
    throw new Error(conversationError?.message || 'Failed to load conversation')
  }

  return conversation
}

async function createConversationLegacy(
  supabase: Awaited<ReturnType<typeof createClient>>,
  currentUserId: string,
  targetUserId: string
): Promise<string> {
  const { data: summaries } = await supabase.rpc('get_conversation_summaries')
  const existing = parseConversationSummaries(summaries).find(
    (conversation) =>
      conversation.type === 'direct' && conversation.participant?.id === targetUserId
  )
  if (existing) return existing.id

  const { data: friendship } = await supabase
    .from('friendships')
    .select('id')
    .eq('status', 'accepted')
    .or(
      `and(requester_id.eq.${currentUserId},addressee_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},addressee_id.eq.${currentUserId})`
    )
    .maybeSingle()
  if (!friendship) throw new Error('Only accepted friends can start a conversation')

  const { data: block } = await supabase
    .from('user_blocks')
    .select('id')
    .or(
      `and(blocker_id.eq.${currentUserId},blocked_id.eq.${targetUserId}),and(blocker_id.eq.${targetUserId},blocked_id.eq.${currentUserId})`
    )
    .limit(1)
  if (block?.length) throw new Error('Conversation is unavailable')

  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .insert({ created_by: currentUserId, type: 'direct' })
    .select('id')
    .single()
  if (conversationError || !conversation) {
    throw new Error(conversationError?.message || 'Failed to create conversation')
  }

  const { error: selfError } = await supabase.from('conversation_participants').insert({
    conversation_id: conversation.id,
    user_id: currentUserId,
  })
  if (selfError) throw new Error(selfError.message)

  const { error: participantError } = await supabase.rpc('add_conversation_participant', {
    p_conversation_id: conversation.id,
    p_user_id: targetUserId,
  })
  if (participantError) {
    throw new Error(
      'Database migration is required before a new conversation can be created safely'
    )
  }

  return conversation.id
}

export async function togglePinned(conversationId: string, isPinned: boolean) {
  const id = parseInput(uuidSchema, conversationId)
  const { supabase, user } = await getAuthenticatedClient()
  const { error } = await supabase
    .from('conversation_participants')
    .update({ is_pinned: isPinned })
    .eq('conversation_id', id)
    .eq('user_id', user.id)

  if (error) throw new Error(error.message)
}

export async function toggleMuted(
  conversationId: string,
  isMuted: boolean
): Promise<{ success: boolean; error?: string }> {
  const id = parseInput(uuidSchema, conversationId)
  const { supabase, user } = await getAuthenticatedClient()
  const { error } = await supabase
    .from('conversation_participants')
    .update({ is_muted: isMuted })
    .eq('conversation_id', id)
    .eq('user_id', user.id)

  return error ? { success: false, error: error.message } : { success: true }
}

export async function archiveConversation(
  conversationId: string,
  isArchived: boolean
): Promise<{ success: boolean; error?: string }> {
  const id = parseInput(uuidSchema, conversationId)
  const { supabase, user } = await getAuthenticatedClient()
  const { error } = await supabase
    .from('conversation_participants')
    .update({ is_archived: isArchived })
    .eq('conversation_id', id)
    .eq('user_id', user.id)

  return error ? { success: false, error: error.message } : { success: true }
}

export async function deleteConversation(
  conversationId: string
): Promise<{ success: boolean; error?: string }> {
  const id = parseInput(uuidSchema, conversationId)
  const { supabase } = await getAuthenticatedClient()
  const { error } = await supabase.rpc('delete_conversation_permanently', {
    p_conversation_id: id,
  })

  return error ? { success: false, error: error.message } : { success: true }
}
