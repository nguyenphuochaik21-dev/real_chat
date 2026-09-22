import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types'

// The database authorizes exact, unreferenced objects; Storage API removes the actual bytes.
// Failed jobs remain queued for retry rather than rolling back an already completed deletion.
export async function cleanupUnusedStorage(supabase: SupabaseClient<Database>) {
  try {
    for (let batch = 0; batch < 5; batch++) {
      const { data: jobs, error } = await supabase.rpc('pending_storage_cleanup')
      if (error || !jobs?.length) return
      let failed = false
      for (const bucket of ['chat-media', 'profile-avatars']) {
        const paths = jobs.filter((job) => job.bucket_id === bucket).map((job) => job.object_name)
        if (!paths.length) continue
        const result = await supabase.storage.from(bucket).remove(paths)
        if (result.error) failed = true
      }
      if (failed) return
    }
  } catch {
    // Network failures must not turn a committed message deletion into a reported failure.
    // Its durable queue entry will be retried on the next cleanup/session.
  }
}
