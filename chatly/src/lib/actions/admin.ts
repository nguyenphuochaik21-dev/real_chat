'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { parseInput, uuidSchema } from '@/lib/actions/validation'
import { z } from 'zod'

export interface AdminUser {
  id: string
  email: string | null
  username: string
  display_name: string
  avatar_url: string | null
  role: 'user' | 'admin'
  is_suspended: boolean
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
}

export interface AdminUsersPage {
  users: AdminUser[]
  totalUsers: number
}

type RawAdminUser = Omit<AdminUser, 'role' | 'status'> & {
  role: string
  status: string | null
  total_count?: number
}

const adminSearchSchema = z.string().trim().max(100)
const adminOffsetSchema = z.number().int().min(0).max(1_000_000)
const adminLimitSchema = z.number().int().min(1).max(100)

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
  const [usersPage, statsResult] = await Promise.all([
    getAdminUsersPage('', 0, 50),
    supabase.rpc('get_admin_dashboard_stats'),
  ])

  if (statsResult.error) throw new Error(statsResult.error.message)

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
  }
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
