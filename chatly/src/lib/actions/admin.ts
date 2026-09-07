'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { parseInput, uuidSchema } from '@/lib/actions/validation'
import { z } from 'zod'
import type { Tables } from '@/types'

export interface AdminUser {
  id: string
  email: string | null
  username: string
  display_name: string
  avatar_url: string | null
  role: 'user' | 'admin'
  is_suspended: boolean
  is_verified: boolean
  status: 'online' | 'offline' | 'away' | 'busy' | null
  last_seen: string | null
  created_at: string | null
  friend_count: number
}

export interface AdminStats {
  users: number
  suspendedUsers: number
  conversations: number
  messages: number
  friendships: number
  calls: number
}

export interface AdminDashboardData {
  currentUserId: string
  users: AdminUser[]
  totalUsers: number
  stats: AdminStats
  supportRequests: AdminSupportRequest[]
  totalSupportRequests: number
}

export interface AdminSupportRequest extends Tables<'support_requests'> {
  user: Pick<AdminUser, 'id' | 'display_name' | 'username' | 'avatar_url'> | null
}

export interface AdminUsersPage {
  users: AdminUser[]
  totalUsers: number
}

type RawAdminUser = Omit<AdminUser, 'role' | 'status' | 'is_verified'> & {
  role: string
  status: string | null
  is_verified?: boolean
  total_count?: number
}

type RawSupportRequest = Tables<'support_requests'> & {
  user: AdminSupportRequest['user'] | AdminSupportRequest['user'][]
}

const adminSearchSchema = z.string().trim().max(100)
const adminOffsetSchema = z.number().int().min(0).max(1_000_000)
const adminLimitSchema = z.number().int().min(1).max(100)
const supportStatusSchema = z.enum(['open', 'in_progress', 'resolved'])
const supportResponseSchema = z.string().trim().max(4000)

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Authentication required')

  const { data: isAdmin, error } = await supabase.rpc('is_chatly_admin', {
    p_user_id: user.id,
  })
  if (error || !isAdmin) throw new Error('Administrator access required')

  return { supabase, user }
}

function numberValue(value: unknown) {
  return typeof value === 'number' ? value : Number(value) || 0
}

function normalizeAdminUsers(rows: RawAdminUser[]): AdminUser[] {
  return rows.map((managedUser) => ({
    ...managedUser,
    role: managedUser.role === 'admin' ? 'admin' : 'user',
    status:
      managedUser.status === 'online' ||
      managedUser.status === 'away' ||
      managedUser.status === 'busy'
        ? managedUser.status
        : 'offline',
    friend_count: numberValue(managedUser.friend_count),
    is_verified: managedUser.role === 'admin' || managedUser.is_verified === true,
  }))
}

export async function getAdminUsersPage(
  query = '',
  offset = 0,
  limit = 50
): Promise<AdminUsersPage> {
  const search = parseInput(adminSearchSchema, query)
  const safeOffset = parseInput(adminOffsetSchema, offset)
  const safeLimit = parseInput(adminLimitSchema, limit)
  const { supabase } = await requireAdmin()
  const result = await supabase.rpc('admin_list_users_page', {
    p_search: search,
    p_offset: safeOffset,
    p_limit: safeLimit,
  })

  if (result.error) {
    const isMissingMigration =
      result.error.code === 'PGRST202' || result.error.message.includes('admin_list_users_page')
    if (!isMissingMigration) throw new Error(result.error.message)

    const fallback = await supabase.rpc('admin_list_users')
    if (fallback.error) throw new Error(fallback.error.message)
    const allUsers = normalizeAdminUsers(fallback.data ?? [])
    const normalizedSearch = search.toLocaleLowerCase()
    const filtered = normalizedSearch
      ? allUsers.filter((managedUser) =>
          `${managedUser.display_name} ${managedUser.username} ${managedUser.email ?? ''}`
            .toLocaleLowerCase()
            .includes(normalizedSearch)
        )
      : allUsers
    return {
      users: filtered.slice(safeOffset, safeOffset + safeLimit),
      totalUsers: filtered.length,
    }
  }

  const rows = result.data ?? []
  return {
    users: normalizeAdminUsers(rows),
    totalUsers: numberValue(rows[0]?.total_count),
  }
}

export async function getAdminDashboard(): Promise<AdminDashboardData> {
  const { supabase, user } = await requireAdmin()
  const [usersResult, statsResult, supportResult] = await Promise.all([
    supabase.rpc('admin_list_users_page', { p_search: '', p_offset: 0, p_limit: 50 }),
    supabase.rpc('get_admin_dashboard_stats'),
    supabase
      .from('support_requests')
      .select('*, user:profiles(id, display_name, username, avatar_url)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(30),
  ])

  if (usersResult.error) throw new Error(usersResult.error.message)
  if (statsResult.error) throw new Error(statsResult.error.message)
  if (supportResult.error) throw new Error(supportResult.error.message)

  const rawUsers = usersResult.data ?? []
  const users = normalizeAdminUsers(rawUsers)
  const supportRequests = ((supportResult.data ?? []) as RawSupportRequest[]).map((request) => ({
    ...request,
    user: Array.isArray(request.user) ? (request.user[0] ?? null) : request.user,
  }))

  const statsValue =
    statsResult.data && typeof statsResult.data === 'object' && !Array.isArray(statsResult.data)
      ? statsResult.data
      : {}

  return {
    currentUserId: user.id,
    users,
    totalUsers: numberValue(rawUsers[0]?.total_count),
    stats: {
      users: numberValue(statsValue.users),
      suspendedUsers: numberValue(statsValue.suspendedUsers),
      conversations: numberValue(statsValue.conversations),
      messages: numberValue(statsValue.messages),
      friendships: numberValue(statsValue.friendships),
      calls: numberValue(statsValue.calls),
    },
    supportRequests,
    totalSupportRequests: supportResult.count ?? 0,
  }
}

export async function setAdminUserVerified(userId: string, verified: boolean) {
  const id = parseInput(uuidSchema, userId)
  const { supabase } = await requireAdmin()
  const { error } = await supabase.rpc('admin_set_user_verified', {
    p_user_id: id,
    p_verified: verified,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
}

export async function getAdminSupportRequests(offset = 0, limit = 30) {
  const safeOffset = parseInput(adminOffsetSchema, offset)
  const safeLimit = parseInput(adminLimitSchema, limit)
  const { supabase } = await requireAdmin()
  const { data, error, count } = await supabase
    .from('support_requests')
    .select('*, user:profiles(id, display_name, username, avatar_url)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1)
  if (error) throw new Error(error.message)
  return {
    requests: ((data ?? []) as RawSupportRequest[]).map((request) => ({
      ...request,
      user: Array.isArray(request.user) ? (request.user[0] ?? null) : request.user,
    })),
    total: count ?? 0,
  }
}

export async function updateSupportRequest(requestId: string, status: string, response: string) {
  const id = parseInput(uuidSchema, requestId)
  const safeStatus = parseInput(supportStatusSchema, status)
  const safeResponse = parseInput(supportResponseSchema, response)
  const { supabase, user } = await requireAdmin()
  const resolved = safeStatus === 'resolved'
  const { error } = await supabase
    .from('support_requests')
    .update({
      status: safeStatus,
      admin_response: safeResponse || null,
      updated_at: new Date().toISOString(),
      resolved_at: resolved ? new Date().toISOString() : null,
      resolved_by: resolved ? user.id : null,
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
}

export async function updateAdminUser(
  userId: string,
  role: 'user' | 'admin',
  isSuspended: boolean
) {
  const id = parseInput(uuidSchema, userId)
  const { supabase } = await requireAdmin()
  const { error } = await supabase.rpc('admin_update_user', {
    p_user_id: id,
    p_role: role,
    p_is_suspended: isSuspended,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
}
