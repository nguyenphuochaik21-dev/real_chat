'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

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
  stats: AdminStats
}

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

export async function getAdminDashboard(): Promise<AdminDashboardData> {
  const { supabase, user } = await requireAdmin()
  const [usersResult, statsResult] = await Promise.all([
    supabase.rpc('admin_list_users'),
    supabase.rpc('get_admin_dashboard_stats'),
  ])

  if (usersResult.error) throw new Error(usersResult.error.message)
  if (statsResult.error) throw new Error(statsResult.error.message)

  const statsValue =
    statsResult.data && typeof statsResult.data === 'object' && !Array.isArray(statsResult.data)
      ? statsResult.data
      : {}

  return {
    currentUserId: user.id,
    users: ((usersResult.data ?? []) as Array<Omit<AdminUser, 'role'> & { role: string }>).map(
      (managedUser) => ({
        ...managedUser,
        role: managedUser.role === 'admin' ? 'admin' : 'user',
        friend_count: numberValue(managedUser.friend_count),
      })
    ),
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
  const { supabase } = await requireAdmin()
  const { error } = await supabase.rpc('admin_update_user', {
    p_user_id: userId,
    p_role: role,
    p_is_suspended: isSuspended,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/admin')
}
