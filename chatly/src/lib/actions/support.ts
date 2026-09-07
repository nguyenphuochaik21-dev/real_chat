'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { parseInput } from '@/lib/actions/validation'
import type { Json, Tables } from '@/types'

const categorySchema = z.enum(['account', 'messaging', 'calling', 'privacy', 'report', 'other'])
const contentSchema = z.string().trim().min(5).max(4000)

export interface SupportAdmin {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  is_verified: boolean
}

function parseAdmin(value: Json | null): SupportAdmin | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  if (typeof value.id !== 'string' || typeof value.display_name !== 'string') return null
  return {
    id: value.id,
    username: typeof value.username === 'string' ? value.username : '',
    display_name: value.display_name,
    avatar_url: typeof value.avatar_url === 'string' ? value.avatar_url : null,
    is_verified: true,
  }
}

async function authenticatedClient() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Authentication required')
  return { supabase, user }
}

export async function getSupportPageData() {
  const { supabase, user } = await authenticatedClient()
  const [adminResult, requestsResult] = await Promise.all([
    supabase.rpc('get_support_admin_profile'),
    supabase
      .from('support_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30),
  ])
  if (adminResult.error) throw new Error(adminResult.error.message)
  if (requestsResult.error) throw new Error(requestsResult.error.message)
  return {
    admin: parseAdmin(adminResult.data),
    requests: requestsResult.data as Tables<'support_requests'>[],
  }
}

export async function submitSupportRequest(category: string, content: string) {
  const safeCategory = parseInput(categorySchema, category)
  const safeContent = parseInput(contentSchema, content)
  const { supabase, user } = await authenticatedClient()
  const { data, error } = await supabase
    .from('support_requests')
    .insert({ user_id: user.id, category: safeCategory, content: safeContent })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}
