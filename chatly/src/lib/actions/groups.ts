'use server'

import { createClient } from '@/lib/supabase/server'
import { parseInput, shortTextSchema, uuidSchema } from '@/lib/actions/validation'
import type { PublicProfile, Tables } from '@/types'
import { z } from 'zod'

export type GroupMemberRole = 'owner' | 'admin' | 'member'

export interface GroupMember {
  joinedAt: string | null
  role: GroupMemberRole
  profile: PublicProfile
}

export interface GroupDetails {
  conversation: Tables<'conversations'>
  currentUserRole: GroupMemberRole
  members: GroupMember[]
}

async function getAuthenticatedClient() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('Authentication required')
  return { supabase, user }
}

export async function createGroup(title: string, memberIds: string[]): Promise<string> {
  const groupTitle = parseInput(shortTextSchema, title)
  const members = Array.from(new Set(parseInput(z.array(uuidSchema).min(2).max(99), memberIds)))
  const { supabase } = await getAuthenticatedClient()
  const { data, error } = await supabase.rpc('create_group_conversation', {
    p_title: groupTitle,
    p_member_ids: members,
  })

  if (error) throw new Error(error.message)
  return data
}

export async function getGroupDetails(conversationId: string): Promise<GroupDetails> {
  const id = parseInput(uuidSchema, conversationId)
  const { supabase, user } = await getAuthenticatedClient()
  const [conversationResult, participantsResult] = await Promise.all([
    supabase.from('conversations').select('*').eq('id', id).eq('type', 'group').single(),
    supabase
      .from('conversation_participants')
      .select(
        'joined_at, role, profile:profiles(id, username, display_name, avatar_url, bio, status, last_seen, created_at)'
      )
      .eq('conversation_id', id)
      .order('joined_at'),
  ])

  if (conversationResult.error) throw new Error(conversationResult.error.message)
  if (participantsResult.error) throw new Error(participantsResult.error.message)

  const members = (participantsResult.data ?? []).flatMap((participant) => {
    const profile = (
      Array.isArray(participant.profile) ? participant.profile[0] : participant.profile
    ) as PublicProfile | null
    if (!profile) return []
    return [
      {
        joinedAt: participant.joined_at,
        role: participant.role,
        profile,
      },
    ]
  })
  const currentUserRole = members.find((member) => member.profile.id === user.id)?.role

  if (!currentUserRole) throw new Error('You are not a member of this group')

  return {
    conversation: conversationResult.data,
    currentUserRole,
    members,
  }
}

export async function inviteGroupMembers(conversationId: string, userIds: string[]) {
  const id = parseInput(uuidSchema, conversationId)
  const members = Array.from(new Set(parseInput(z.array(uuidSchema).min(1).max(99), userIds)))
  const { supabase } = await getAuthenticatedClient()
  const { data, error } = await supabase.rpc('invite_group_members', {
    p_conversation_id: id,
    p_user_ids: members,
  })

  if (error) throw new Error(error.message)
  return data
}

export async function updateGroupDetails(
  conversationId: string,
  title: string,
  avatarUrl?: string | null
) {
  const id = parseInput(uuidSchema, conversationId)
  const groupTitle = parseInput(shortTextSchema, title)
  const safeAvatarUrl = parseInput(
    z.string().trim().min(1).max(1_024).nullable(),
    avatarUrl ?? null
  )
  const { supabase } = await getAuthenticatedClient()
  const { error } = await supabase.rpc('update_group_details', {
    p_conversation_id: id,
    p_title: groupTitle,
    p_avatar_url: safeAvatarUrl ?? undefined,
  })

  if (error) throw new Error(error.message)
}

export async function setGroupMemberRole(
  conversationId: string,
  userId: string,
  role: Exclude<GroupMemberRole, 'owner'>
) {
  const id = parseInput(uuidSchema, conversationId)
  const memberId = parseInput(uuidSchema, userId)
  const { supabase } = await getAuthenticatedClient()
  const { error } = await supabase.rpc('set_group_member_role', {
    p_conversation_id: id,
    p_user_id: memberId,
    p_role: role,
  })

  if (error) throw new Error(error.message)
}

export async function removeGroupMember(conversationId: string, userId: string) {
  const id = parseInput(uuidSchema, conversationId)
  const memberId = parseInput(uuidSchema, userId)
  const { supabase } = await getAuthenticatedClient()
  const { error } = await supabase.rpc('remove_group_member', {
    p_conversation_id: id,
    p_user_id: memberId,
  })

  if (error) throw new Error(error.message)
}

export async function leaveGroup(conversationId: string) {
  const id = parseInput(uuidSchema, conversationId)
  const { supabase } = await getAuthenticatedClient()
  const { error } = await supabase.rpc('leave_group', {
    p_conversation_id: id,
  })

  if (error) throw new Error(error.message)
}
