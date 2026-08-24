'use client'

import { currentUser } from '@/lib/mock/users'
import type { MockUser } from '@/lib/mock/types'

/**
 * Hook to get the current mock user.
 * In Phase 2, this will be replaced with Supabase auth.
 */
export function useCurrentUser(): MockUser {
  return currentUser
}
