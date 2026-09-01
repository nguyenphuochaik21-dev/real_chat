'use server'

import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types'

export type GroupMemberRole = 'owner' | 'admin' | 'member'

export interface GroupMember {
  joinedAt: string | null
  role: GroupMemberRole
  profile: Tables<'profiles'>
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
  const { supabase } = await getAuthenticatedClient()
  const { data, error } = await supabase.rpc('create_group_conversation', {
    p_title: title,
    p_member_ids: memberIds,
  })

  if (error) throw new Error(error.message)
  return data
}

export async function getGroupDetails(conversationId: string): Promise<GroupDetails> {
  const { supabase, user } = await getAuthenticatedClient()
  const [conversationResult, participantsResult] = await Promise.all([
    supabase
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .eq('type', 'group')
      .single(),
    supabase
      .from('conversation_participants')
      .select('joined_at, role, profile:profiles(*)')
      .eq('conversation_id', conversationId)
      .order('joined_at'),
  ])

  if (conversationResult.error) throw new Error(conversationResult.error.message)
  if (participantsResult.error) throw new Error(participantsResult.error.message)

  const members = (participantsResult.data ?? []).flatMap((participant) => {
    const profile = (
      Array.isArray(participant.profile) ? participant.profile[0] : participant.profile
    ) as Tables<'profiles'> | null
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
  const { supabase } = await getAuthenticatedClient()
  const { data, error } = await supabase.rpc('invite_group_members', {
    p_conversation_id: conversationId,
    p_user_ids: userIds,
  })

  if (error) throw new Error(error.message)
  return data
}

export async function updateGroupDetails(
  conversationId: string,
  title: string,
  avatarUrl?: string | null
) {
  const { supabase } = await getAuthenticatedClient()
  const { error } = await supabase.rpc('update_group_details', {
    p_conversation_id: conversationId,
    p_title: title,
    p_avatar_url: avatarUrl ?? undefined,
  })

  if (error) throw new Error(error.message)
}

export async function setGroupMemberRole(
  conversationId: string,
  userId: string,
  role: Exclude<GroupMemberRole, 'owner'>
) {
  const { supabase } = await getAuthenticatedClient()
  const { error } = await supabase.rpc('set_group_member_role', {
    p_conversation_id: conversationId,
    p_user_id: userId,
    p_role: role,
  })

  if (error) throw new Error(error.message)
}

export async function removeGroupMember(conversationId: string, userId: string) {
  const { supabase } = await getAuthenticatedClient()
  const { error } = await supabase.rpc('remove_group_member', {
    p_conversation_id: conversationId,
    p_user_id: userId,
  })

  if (error) throw new Error(error.message)
}

export async function leaveGroup(conversationId: string) {
  const { supabase } = await getAuthenticatedClient()
  const { error } = await supabase.rpc('leave_group', {
    p_conversation_id: conversationId,
  })

  if (error) throw new Error(error.message)
}
