'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/types'

type Profile = Tables<'profiles'>

export function useProfile(userId: string | null) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (!userId) {
        setProfile(null)
        setLoading(false)
        return
      }

      const getProfile = async () => {
        const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
        setProfile(data)
        setLoading(false)
      }

      void getProfile()
    }, 0)

    if (!userId) return () => window.clearTimeout(timeoutId)

    // Subscribe to profile changes
    const channel = supabase
      .channel(`profile-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setProfile(payload.new as Profile)
          }
        }
      )
      .subscribe()

    return () => {
      window.clearTimeout(timeoutId)
      supabase.removeChannel(channel)
    }
  }, [userId, supabase])

  return { profile, loading }
}
