'use server'

import { createClient } from '@/lib/supabase/server'
import { parseInput, uuidSchema } from '@/lib/actions/validation'
import type { PublicProfile } from '@/types'

export type FriendProfile = PublicProfile

export interface FriendshipItem {
  id: string
  requesterId: string
  addresseeId: string
  status: 'pending' | 'accepted' | 'declined'
  profile: FriendProfile
}

export interface FriendshipOverview {
  currentUserId: string
  friends: FriendshipItem[]
  incoming: FriendshipItem[]
  outgoing: FriendshipItem[]
  discover: FriendProfile[]
}

interface FriendshipRow {
  id: string
  requester_id: string
  addressee_id: string
  status: 'pending' | 'accepted' | 'declined'
}

async function getAuthenticatedUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('Authentication required')
  return { supabase, user }
}

export async function getFriendshipOverview(): Promise<FriendshipOverview> {
  const { supabase, user } = await getAuthenticatedUser()

  const relationsResult = await supabase
    .from('friendships')
    .select('id, requester_id, addressee_id, status')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)

  if (relationsResult.error) throw new Error(relationsResult.error.message)

  const relations = (relationsResult.data ?? []) as FriendshipRow[]
  const relatedIds = Array.from(
    new Set(
      relations.map((relation) =>
        relation.requester_id === user.id ? relation.addressee_id : relation.requester_id
      )
    )
  )

  const relatedProfilesPromise = relatedIds.length
    ? supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio, status, last_seen, created_at')
        .in('id', relatedIds)
    : Promise.resolve({ data: [] as FriendProfile[], error: null })

  const [relatedProfilesResult, discoveryResult] = await Promise.all([
    relatedProfilesPromise,
    supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, bio, status, last_seen, created_at')
      .neq('id', user.id)
      .order('display_name')
      .limit(200),
  ])

  if (relatedProfilesResult.error) throw new Error(relatedProfilesResult.error.message)
  if (discoveryResult.error) throw new Error(discoveryResult.error.message)

  const relatedProfiles = (relatedProfilesResult.data ?? []) as FriendProfile[]
  const profileMap = new Map(relatedProfiles.map((profile) => [profile.id, profile]))

  const toItem = (relation: FriendshipRow): FriendshipItem | null => {
    const otherId =
      relation.requester_id === user.id ? relation.addressee_id : relation.requester_id
    const profile = profileMap.get(otherId)
    if (!profile) return null
    return {
      id: relation.id,
      requesterId: relation.requester_id,
      addresseeId: relation.addressee_id,
      status: relation.status,
      profile,
    }
  }

  const items = relations.map(toItem).filter((item): item is FriendshipItem => item !== null)
  const relatedUserIds = new Set(
    relations
      .filter((relation) => relation.status !== 'declined')
      .map((relation) =>
        relation.requester_id === user.id ? relation.addressee_id : relation.requester_id
      )
  )

  return {
    currentUserId: user.id,
    friends: items.filter((item) => item.status === 'accepted'),
    incoming: items.filter((item) => item.status === 'pending' && item.addresseeId === user.id),
    outgoing: items.filter((item) => item.status === 'pending' && item.requesterId === user.id),
    discover: ((discoveryResult.data ?? []) as FriendProfile[])
      .filter((profile) => !relatedUserIds.has(profile.id))
      .slice(0, 50),
  }
}

export async function sendFriendRequest(profileId: string) {
  const id = parseInput(uuidSchema, profileId)
  const { supabase } = await getAuthenticatedUser()
  const { error } = await supabase.rpc('send_friend_request', { p_addressee_id: id })
  if (error) throw new Error(error.message)
}

export async function respondFriendRequest(friendshipId: string, accept: boolean) {
  const id = parseInput(uuidSchema, friendshipId)
  const { supabase } = await getAuthenticatedUser()
  const { error } = await supabase.rpc('respond_friend_request', {
    p_friendship_id: id,
    p_accept: accept,
  })
  if (error) throw new Error(error.message)
}

export async function removeFriendship(friendshipId: string) {
  const id = parseInput(uuidSchema, friendshipId)
  const { supabase } = await getAuthenticatedUser()
  const { error } = await supabase.rpc('remove_friendship', {
    p_friendship_id: id,
  })
  if (error) throw new Error(error.message)
}
