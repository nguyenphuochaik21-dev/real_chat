'use server'

import { createClient } from '@/lib/supabase/server'

/**
 * Server Actions for presence management.
 * These are called from client components but execute on the server.
 */

export async function setUserOnline(): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase.rpc('set_user_online')

  if (error) {
    console.error('Failed to set user online:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function setUserOffline(): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase.rpc('set_user_offline')

  if (error) {
    console.error('Failed to set user offline:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function setUserAway(): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase.rpc('set_user_away')

  if (error) {
    console.error('Failed to set user away:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function setUserBusy(): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase.rpc('set_user_busy')

  if (error) {
    console.error('Failed to set user busy:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function getUserPresence(userId: string): Promise<{
  status: 'online' | 'offline' | 'away' | 'busy'
  lastSeen: string | null
} | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('profiles')
    .select('status, last_seen')
    .eq('id', userId)
    .single()

  if (error || !data) {
    return null
  }

  return {
    status: (data.status as 'online' | 'offline' | 'away' | 'busy') || 'offline',
    lastSeen: data.last_seen,
  }
}
