'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/types'

export type Profile = Tables<'profiles'>

export function useContacts(userId: string | null) {
  const [contacts, setContacts] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const fetchContacts = useCallback(async () => {
    if (!userId) {
      setContacts([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Get all users except current user
      const { data, error: contactsError } = await supabase
        .from('profiles')
        .select('*')
        .neq('id', userId)
        .order('display_name', { ascending: true })

      if (contactsError) throw contactsError
      setContacts(data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch contacts')
    } finally {
      setLoading(false)
    }
  }, [userId, supabase])

  useEffect(() => {
    fetchContacts()
  }, [fetchContacts])

  return { contacts, loading, error, refetch: fetchContacts }
}

export function useProfile(profileId: string | null) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const fetchProfile = async () => {
      if (!profileId) {
        setProfile(null)
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const { data, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', profileId)
          .single()

        if (profileError) throw profileError
        setProfile(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch profile')
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [profileId, supabase])

  return { profile, loading, error }
}
