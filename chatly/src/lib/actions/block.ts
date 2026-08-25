'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Block a user
 */
export async function blockUser(
  blockedUserId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  // Prevent blocking yourself
  if (blockedUserId === user.id) {
    return { success: false, error: 'Cannot block yourself' }
  }

  // Insert block record
  const { error } = await supabase
    .from('user_blocks')
    .insert({
      blocker_id: user.id,
      blocked_id: blockedUserId,
    })

  // Ignore if already blocked (unique constraint)
  if (error && error.code !== '23505') {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Unblock a user
 */
export async function unblockUser(
  blockedUserId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  const { error } = await supabase
    .from('user_blocks')
    .delete()
    .eq('blocker_id', user.id)
    .eq('blocked_id', blockedUserId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Check if a user is blocked by the current user
 */
export async function isUserBlocked(
  userId: string
): Promise<boolean> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const { data } = await supabase
    .from('user_blocks')
    .select('id')
    .eq('blocker_id', user.id)
    .eq('blocked_id', userId)
    .single()

  return !!data
}

/**
 * Get list of blocked users
 */
export async function getBlockedUsers(): Promise<string[]> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('user_blocks')
    .select('blocked_id')
    .eq('blocker_id', user.id)
    .order('created_at', { ascending: false })

  return data?.map(b => b.blocked_id) || []
}

/**
 * Get blocked users with profile details
 */
export async function getBlockedUsersWithProfiles() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: blocks } = await supabase
    .from('user_blocks')
    .select('blocked_id, created_at')
    .eq('blocker_id', user.id)
    .order('created_at', { ascending: false })

  if (!blocks || blocks.length === 0) return []

  const blockedIds = blocks.map(b => b.blocked_id)

  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .in('id', blockedIds)

  return (profiles || []).map(profile => ({
    ...profile,
    blocked_at: blocks.find(b => b.blocked_id === profile.id)?.created_at,
  }))
}
