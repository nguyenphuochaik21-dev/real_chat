'use server'

import { createClient } from '@/lib/supabase/server'
import { uuidSchema } from '@/lib/actions/validation'
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

export async function getFriendshipOverview(): Promise<
  { data: FriendshipOverview; error?: never } | { data?: never; error: string }
> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' }
    const { data, error } = await supabase.rpc('get_friendship_overview')
    if (error || !data) {
      console.error('[contacts:overview]', error?.code)
      return { error: 'Không tải được danh bạ. Vui lòng thử lại.' }
    }
    return { data: data as unknown as FriendshipOverview }
  } catch {
    return { error: 'Không thể kết nối. Vui lòng thử lại.' }
  }
}

async function mutateFriendship(
  action: 'send' | 'respond' | 'remove',
  value: string,
  accept = false
) {
  const parsed = uuidSchema.safeParse(value)
  if (!parsed.success) return { error: 'Thông tin bạn bè không hợp lệ.' }
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' }
    const { error } =
      action === 'send'
        ? await supabase.rpc('send_friend_request', { p_addressee_id: parsed.data })
        : action === 'respond'
          ? await supabase.rpc('respond_friend_request', {
              p_friendship_id: parsed.data,
              p_accept: accept,
            })
          : await supabase.rpc('remove_friendship', { p_friendship_id: parsed.data })
    if (error) {
      console.error('[contacts:mutation]', action, error.code)
      return { error: 'Không thể thực hiện yêu cầu. Hãy tải lại danh bạ và thử lại.' }
    }
    return { error: null }
  } catch {
    return { error: 'Không thể kết nối. Vui lòng thử lại.' }
  }
}

export async function sendFriendRequest(profileId: string) {
  return mutateFriendship('send', profileId)
}
export async function respondFriendRequest(friendshipId: string, accept: boolean) {
  return mutateFriendship('respond', friendshipId, accept)
}
export async function removeFriendship(friendshipId: string) {
  return mutateFriendship('remove', friendshipId)
}
