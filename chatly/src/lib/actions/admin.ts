'use server'

import { getServerAuth } from '@/lib/supabase/auth'
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
  assignedAdmin: Pick<AdminUser, 'id' | 'display_name' | 'username' | 'avatar_url'> | null
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
  assignedAdmin: AdminSupportRequest['assignedAdmin'] | AdminSupportRequest['assignedAdmin'][]
}

const adminSearchSchema = z.string().trim().max(100)
const adminOffsetSchema = z.number().int().min(0).max(1_000_000)
const adminLimitSchema = z.number().int().min(1).max(100)
const supportStatusSchema = z.enum(['open', 'in_progress', 'resolved'])
const supportResponseSchema = z.string().trim().max(4000)
const SUPPORT_REQUEST_SELECT =
  'id, user_id, assigned_admin_id, category, content, status, admin_response, resolved_at, resolved_by, created_at, updated_at, user:profiles!support_requests_user_id_fkey(id, display_name, username, avatar_url), assignedAdmin:profiles!support_requests_assigned_admin_id_fkey(id, display_name, username, avatar_url)'

type ServerSupabaseClient = Awaited<ReturnType<typeof getServerAuth>>['supabase']

async function requireAdmin() {
  const { supabase, user } = await getServerAuth()
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

function normalizeSupportRequest(request: RawSupportRequest): AdminSupportRequest {
  return {
    ...request,
    user: Array.isArray(request.user) ? (request.user[0] ?? null) : request.user,
    assignedAdmin: Array.isArray(request.assignedAdmin)
      ? (request.assignedAdmin[0] ?? null)
      : request.assignedAdmin,
  }
}

function isMissingDatabaseFeature(error: { code?: string; message: string }, featureName: string) {
  return (
    error.code === 'PGRST202' ||
    error.code === '42P01' ||
    error.code === '42703' ||
    error.code === '42883' ||
    error.message.includes(featureName)
  )
}

async function fetchAdminUsersPage(
  supabase: ServerSupabaseClient,
  search: string,
  offset: number,
  limit: number
): Promise<AdminUsersPage> {
  const result = await supabase.rpc('admin_list_users_page', {
    p_search: search,
    p_offset: offset,
    p_limit: limit,
  })

  if (result.error) {
    if (!isMissingDatabaseFeature(result.error, 'admin_list_users_page')) {
      throw new Error(result.error.message)
    }

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
      users: filtered.slice(offset, offset + limit),
      totalUsers: filtered.length,
    }
  }

  const rows = result.data ?? []
  return {
    users: normalizeAdminUsers(rows),
    totalUsers: numberValue(rows[0]?.total_count),
  }
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
  return fetchAdminUsersPage(supabase, search, safeOffset, safeLimit)
}

export async function getAdminDashboard(): Promise<AdminDashboardData> {
  const { supabase, user } = await requireAdmin()
  const [usersPage, statsResult, supportResult] = await Promise.all([
    fetchAdminUsersPage(supabase, '', 0, 50),
    supabase.rpc('get_admin_dashboard_stats'),
    supabase
      .from('support_requests')
      .select(SUPPORT_REQUEST_SELECT, { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(30),
  ])

  if (statsResult.error) throw new Error(statsResult.error.message)
  if (supportResult.error && !isMissingDatabaseFeature(supportResult.error, 'support_requests')) {
    throw new Error(supportResult.error.message)
  }

  const supportRequests = ((supportResult.data ?? []) as RawSupportRequest[]).map(
    normalizeSupportRequest
  )

  const statsValue =
    statsResult.data && typeof statsResult.data === 'object' && !Array.isArray(statsResult.data)
      ? statsResult.data
      : {}

  return {
    currentUserId: user.id,
    users: usersPage.users,
    totalUsers: usersPage.totalUsers,
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
}

export async function getAdminSupportRequests(offset = 0, limit = 30) {
  const safeOffset = parseInput(adminOffsetSchema, offset)
  const safeLimit = parseInput(adminLimitSchema, limit)
  const { supabase } = await requireAdmin()
  const { data, error, count } = await supabase
    .from('support_requests')
    .select(SUPPORT_REQUEST_SELECT, { count: safeOffset === 0 ? 'exact' : undefined })
    .order('created_at', { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1)
  if (error) throw new Error(error.message)
  return {
    requests: ((data ?? []) as RawSupportRequest[]).map(normalizeSupportRequest),
    total: count,
  }
}

export async function getAdminSupportRequest(requestId: string) {
  const id = parseInput(uuidSchema, requestId)
  const { supabase } = await requireAdmin()
  const { data, error } = await supabase
    .from('support_requests')
    .select(SUPPORT_REQUEST_SELECT)
    .eq('id', id)
    .single()
  if (error) throw new Error(error.message)
  return normalizeSupportRequest(data as RawSupportRequest)
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
}
