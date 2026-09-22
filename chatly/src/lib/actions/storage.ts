'use server'

import { createClient } from '@/lib/supabase/server'
import { cleanupUnusedStorage } from '@/lib/supabase/cleanup'

export async function retryStorageCleanup() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) await cleanupUnusedStorage(supabase)
}
