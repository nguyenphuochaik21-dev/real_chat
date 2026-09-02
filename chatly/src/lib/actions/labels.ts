'use server'

import { createClient } from '@/lib/supabase/server'
import { parseInput, shortTextSchema, uuidSchema } from '@/lib/actions/validation'
import type { Tables } from '@/types'
import { z } from 'zod'

type Label = Tables<'conversation_labels'>

export interface LabelWithConversations extends Label {
  conversation_count?: number
}

export interface CreateLabelParams {
  name: string
  color: string
}

export interface UpdateLabelParams {
  id: string
  name?: string
  color?: string
}

/**
 * Create a new conversation label
 */
export async function createLabel(
  params: CreateLabelParams
): Promise<{ success: boolean; label?: Label; error?: string }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const name = parseInput(shortTextSchema, params.name)

  // Validate color format (hex)
  const hexColorRegex = /^#[0-9A-Fa-f]{6}$/
  if (!hexColorRegex.test(params.color)) {
    return { success: false, error: 'Invalid color format. Use hex format like #8B5CF6' }
  }

  const { data, error } = await supabase
    .from('conversation_labels')
    .insert({
      user_id: user.id,
      name,
      color: params.color,
    })
    .select()
    .single()

  if (error) {
    console.error('Failed to create label:', error)
    return { success: false, error: error.message }
  }

  return { success: true, label: data }
}

/**
 * Update an existing conversation label
 */
export async function updateLabel(
  params: UpdateLabelParams
): Promise<{ success: boolean; label?: Label; error?: string }> {
  const labelId = parseInput(uuidSchema, params.id)
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // Verify ownership
  const { data: existing } = await supabase
    .from('conversation_labels')
    .select('id, user_id')
    .eq('id', labelId)
    .single()

  if (!existing) {
    return { success: false, error: 'Label not found' }
  }

  if (existing.user_id !== user.id) {
    return { success: false, error: 'Not authorized to update this label' }
  }

  const updates: Partial<{
    name: string
    color: string
  }> = {}

  if (params.name !== undefined) {
    updates.name = parseInput(shortTextSchema, params.name)
  }

  if (params.color !== undefined) {
    const hexColorRegex = /^#[0-9A-Fa-f]{6}$/
    if (!hexColorRegex.test(params.color)) {
      return { success: false, error: 'Invalid color format. Use hex format like #8B5CF6' }
    }
    updates.color = params.color
  }

  const { data, error } = await supabase
    .from('conversation_labels')
    .update(updates)
    .eq('id', labelId)
    .select()
    .single()

  if (error) {
    console.error('Failed to update label:', error)
    return { success: false, error: error.message }
  }

  return { success: true, label: data }
}

/**
 * Delete a conversation label
 */
export async function deleteLabel(labelId: string): Promise<{ success: boolean; error?: string }> {
  const id = parseInput(uuidSchema, labelId)
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // Verify ownership
  const { data: existing } = await supabase
    .from('conversation_labels')
    .select('id, user_id')
    .eq('id', id)
    .single()

  if (!existing) {
    return { success: false, error: 'Label not found' }
  }

  if (existing.user_id !== user.id) {
    return { success: false, error: 'Not authorized to delete this label' }
  }

  // Delete the label (cascade will remove mappings)
  const { error } = await supabase.from('conversation_labels').delete().eq('id', id)

  if (error) {
    console.error('Failed to delete label:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Get all labels for the current user
 */
export async function getLabels(): Promise<{
  success: boolean
  labels?: Label[]
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
    .from('conversation_labels')
    .select('*')
    .eq('user_id', user.id)
    .order('name', { ascending: true })

  if (error) {
    console.error('Failed to fetch labels:', error)
    return { success: false, error: error.message }
  }

  return { success: true, labels: data || [] }
}

/**
 * Assign a label to a conversation
 */
export async function assignLabelToConversation(
  conversationId: string,
  labelId: string
): Promise<{ success: boolean; error?: string }> {
  const conversation = parseInput(uuidSchema, conversationId)
  const label = parseInput(uuidSchema, labelId)
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
    .eq('conversation_id', conversation)
    .eq('user_id', user.id)
    .single()

  if (!participation) {
    return { success: false, error: 'Not authorized to label this conversation' }
  }

  // Verify label belongs to user
  const { data: ownedLabel } = await supabase
    .from('conversation_labels')
    .select('id, user_id')
    .eq('id', label)
    .single()

  if (!ownedLabel) {
    return { success: false, error: 'Label not found' }
  }

  if (ownedLabel.user_id !== user.id) {
    return { success: false, error: 'Not authorized to use this label' }
  }

  const { error } = await supabase.from('conversation_label_map').upsert(
    {
      conversation_id: conversation,
      label_id: label,
    },
    {
      onConflict: 'conversation_id,label_id',
    }
  )

  if (error) {
    console.error('Failed to assign label:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Remove a label from a conversation
 */
export async function removeLabelFromConversation(
  conversationId: string,
  labelId: string
): Promise<{ success: boolean; error?: string }> {
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
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id)
    .single()

  if (!participation) {
    return { success: false, error: 'Not authorized to modify labels on this conversation' }
  }

  const { error } = await supabase
    .from('conversation_label_map')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('label_id', labelId)

  if (error) {
    console.error('Failed to remove label:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Get labels for multiple conversations (batch query)
 */
export async function getLabelsForConversations(conversationIds: string[]): Promise<{
  success: boolean
  labelsByConversation?: Map<string, Label[]>
  error?: string
}> {
  if (conversationIds.length === 0) {
    return { success: true, labelsByConversation: new Map() }
  }

  const ids = Array.from(new Set(parseInput(z.array(uuidSchema).max(200), conversationIds)))

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const { data, error } = await supabase
    .from('conversation_label_map')
    .select(
      `
      conversation_id,
      label:conversation_labels(
        *
      )
    `
    )
    .in('conversation_id', ids)

  if (error) {
    console.error('Failed to fetch labels for conversations:', error)
    return { success: false, error: error.message }
  }

  // Group by conversation_id
  const labelsByConversation = new Map<string, Label[]>()
  for (const item of data || []) {
    const convId = item.conversation_id
    if (!convId) continue
    // Supabase returns nested relations as arrays, get first element
    const labelArray = item.label as unknown as Label[] | null
    const label = Array.isArray(labelArray) ? labelArray[0] : labelArray
    if (label && label.id) {
      if (!labelsByConversation.has(convId)) {
        labelsByConversation.set(convId, [])
      }
      labelsByConversation.get(convId)!.push(label)
    }
  }

  return { success: true, labelsByConversation }
}
