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
  joinRequests: GroupJoinRequest[]
}

export interface GroupJoinRequest {
  id: string
  createdAt: string
  profile: PublicProfile
}

export interface GroupShareInfo {
  id: string
  title: string
  avatar_url: string | null
  join_requires_approval: boolean
  member_count: number
  is_member: boolean
  request_pending: boolean
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

  let joinRequests: GroupJoinRequest[] = []
  if (currentUserRole === 'owner' || currentUserRole === 'admin') {
    const { data: requests, error: requestsError } = await supabase
      .from('group_join_requests')
      .select(
        'id, created_at, profile:profiles!group_join_requests_user_id_fkey(id, username, display_name, avatar_url, bio, status, last_seen, created_at, is_verified)'
      )
      .eq('conversation_id', id)
      .eq('status', 'pending')
      .order('created_at')
      .limit(100)
    if (requestsError) throw new Error(requestsError.message)
    joinRequests = (requests ?? []).flatMap((request) => {
      const profile = Array.isArray(request.profile) ? request.profile[0] : request.profile
      return profile
        ? [{ id: request.id, createdAt: request.created_at, profile: profile as PublicProfile }]
        : []
    })
  }

  return {
    conversation: conversationResult.data,
    currentUserRole,
    members,
    joinRequests,
  }
}

export async function setGroupJoinApproval(conversationId: string, enabled: boolean) {
  const id = parseInput(uuidSchema, conversationId)
  const { supabase } = await getAuthenticatedClient()
  const { data, error } = await supabase.rpc('set_group_join_approval', {
    p_conversation_id: id,
    p_enabled: enabled,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function resolveGroupJoinRequest(requestId: string, approve: boolean) {
  const id = parseInput(uuidSchema, requestId)
  const { supabase } = await getAuthenticatedClient()
  const { error } = await supabase.rpc('resolve_group_join_request', {
    p_request_id: id,
    p_approve: approve,
  })
  if (error) throw new Error(error.message)
}

export async function getGroupShareInfo(token: string): Promise<GroupShareInfo | null> {
  const shareToken = parseInput(uuidSchema, token)
  const { supabase } = await getAuthenticatedClient()
  const { data, error } = await supabase.rpc('get_group_share_info', {
    p_share_token: shareToken,
  })
  if (error) throw new Error(error.message)
  if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.id !== 'string') {
    return null
  }
  return {
    id: data.id,
    title: typeof data.title === 'string' ? data.title : 'Group',
    avatar_url: typeof data.avatar_url === 'string' ? data.avatar_url : null,
    join_requires_approval: data.join_requires_approval === true,
    member_count: typeof data.member_count === 'number' ? data.member_count : 0,
    is_member: data.is_member === true,
    request_pending: data.request_pending === true,
  }
}

export async function joinGroupFromShare(token: string) {
  const shareToken = parseInput(uuidSchema, token)
  const { supabase } = await getAuthenticatedClient()
  const { data, error } = await supabase.rpc('join_group_from_share', {
    p_share_token: shareToken,
  })
  if (error) throw new Error(error.message)
  return data === 'pending' ? 'pending' : 'joined'
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
