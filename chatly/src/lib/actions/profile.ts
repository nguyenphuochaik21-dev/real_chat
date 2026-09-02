'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { parseInput, uuidSchema } from '@/lib/actions/validation'
import type { Json, PublicProfile } from '@/types'

export interface PublicProfileDetails extends PublicProfile {
  phone: string | null
  birth_date: string | null
  social_links: string[]
}

export interface MyProfileDetails extends PublicProfileDetails {
  phone_visibility: 'public' | 'private'
  birth_date_visibility: 'public' | 'private'
  updated_at: string | null
  role: string
  is_suspended: boolean
}

const visibilitySchema = z.enum(['public', 'private'])
const httpUrlSchema = z
  .url()
  .max(500)
  .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol), 'Invalid URL')
const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  bio: z.string().trim().max(500),
  phone: z.string().trim().max(30),
  phoneVisibility: visibilitySchema,
  birthDate: z
    .string()
    .trim()
    .refine((value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value), 'Invalid birth date')
    .refine(
      (value) => !value || value <= new Date().toISOString().slice(0, 10),
      'Invalid birth date'
    ),
  birthDateVisibility: visibilitySchema,
  socialLinks: z.array(httpUrlSchema).max(8),
  avatarUrl: httpUrlSchema.max(2_000).nullable().optional(),
})

function asRecord(value: Json | null): Record<string, Json | undefined> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function stringValue(value: Json | undefined): string | null {
  return typeof value === 'string' ? value : null
}

function socialLinksValue(value: Json | undefined): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .filter((item) => {
      try {
        return ['http:', 'https:'].includes(new URL(item).protocol)
      } catch {
        return false
      }
    })
    .slice(0, 8)
}

function parsePublicProfile(value: Json | null): PublicProfileDetails | null {
  const profile = asRecord(value)
  if (!profile || typeof profile.id !== 'string') return null

  return {
    id: profile.id,
    username: stringValue(profile.username) ?? '',
    display_name: stringValue(profile.display_name) ?? '',
    avatar_url: stringValue(profile.avatar_url),
    bio: stringValue(profile.bio),
    status:
      profile.status === 'online' ||
      profile.status === 'away' ||
      profile.status === 'busy' ||
      profile.status === 'offline'
        ? profile.status
        : null,
    last_seen: stringValue(profile.last_seen),
    created_at: stringValue(profile.created_at),
    phone: stringValue(profile.phone),
    birth_date: stringValue(profile.birth_date),
    social_links: socialLinksValue(profile.social_links),
  }
}

export async function getPublicProfile(profileId: string): Promise<PublicProfileDetails | null> {
  const id = parseInput(uuidSchema, profileId)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase.rpc('get_public_profile', { p_profile_id: id })
  if (!error) return parsePublicProfile(data)

  if (error.code !== 'PGRST202' && !error.message.includes('schema cache')) {
    throw new Error(error.message)
  }

  const { data: fallback, error: fallbackError } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, bio, status, last_seen, created_at')
    .eq('id', id)
    .maybeSingle()
  if (fallbackError || !fallback) return null

  return { ...fallback, phone: null, birth_date: null, social_links: [] }
}

export async function getMyProfile(): Promise<MyProfileDetails | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase.rpc('get_my_profile')
  if (!error) {
    const profile = parsePublicProfile(data)
    const raw = asRecord(data)
    if (!profile || !raw) return null
    return {
      ...profile,
      phone_visibility: raw.phone_visibility === 'public' ? 'public' : 'private',
      birth_date_visibility: raw.birth_date_visibility === 'public' ? 'public' : 'private',
      updated_at: stringValue(raw.updated_at),
      role: stringValue(raw.role) ?? 'user',
      is_suspended: raw.is_suspended === true,
    }
  }

  if (error.code !== 'PGRST202' && !error.message.includes('schema cache')) {
    throw new Error(error.message)
  }

  const { data: fallback, error: fallbackError } = await supabase
    .from('profiles')
    .select(
      'id, username, display_name, avatar_url, bio, phone, status, last_seen, created_at, updated_at, role, is_suspended'
    )
    .eq('id', user.id)
    .single()
  if (fallbackError || !fallback) return null

  return {
    ...fallback,
    birth_date: null,
    birth_date_visibility: 'private',
    phone_visibility: 'private',
    social_links: [],
  }
}

export async function updateMyProfile(input: z.input<typeof profileUpdateSchema>) {
  const values = parseInput(profileUpdateSchema, input)
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Authentication required')

  if (values.avatarUrl) {
    const avatarUrl = new URL(values.avatarUrl)
    const supabaseOrigin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin
    const expectedPath = `/storage/v1/object/public/profile-avatars/${user.id}/`
    if (avatarUrl.origin !== supabaseOrigin || !avatarUrl.pathname.startsWith(expectedPath)) {
      throw new Error('Invalid avatar URL')
    }
  }

  const updates = {
    display_name: values.displayName,
    bio: values.bio || null,
    phone: values.phone || null,
    phone_visibility: values.phoneVisibility,
    birth_date: values.birthDate || null,
    birth_date_visibility: values.birthDateVisibility,
    social_links: values.socialLinks,
    updated_at: new Date().toISOString(),
    ...(values.avatarUrl !== undefined ? { avatar_url: values.avatarUrl } : {}),
  }

  const { error } = await supabase.from('profiles').update(updates).eq('id', user.id)
  if (error) throw new Error(error.message)
}
