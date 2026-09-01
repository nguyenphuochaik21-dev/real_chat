import type { Json } from '@/types/database'
import type { Tables } from '@/types'

type Message = Tables<'messages'>
type Profile = Tables<'profiles'>

export interface ConversationSummary extends Tables<'conversations'> {
  participant: Profile | null
  last_message: Message | null
  unread_count: number
  member_count: number
  is_pinned: boolean
  is_muted: boolean
  is_archived: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export function parseConversationSummaries(value: Json | null): ConversationSummary[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== 'string') return []

    return [
      {
        id: item.id,
        type: item.type === 'group' ? 'group' : 'direct',
        title: nullableString(item.title),
        avatar_url: nullableString(item.avatar_url),
        created_by: nullableString(item.created_by),
        last_message_at: nullableString(item.last_message_at),
        created_at: nullableString(item.created_at),
        updated_at: nullableString(item.updated_at),
        participant: isRecord(item.participant) ? (item.participant as Profile) : null,
        last_message: isRecord(item.last_message) ? (item.last_message as Message) : null,
        unread_count: typeof item.unread_count === 'number' ? item.unread_count : 0,
        member_count: typeof item.member_count === 'number' ? item.member_count : 0,
        is_pinned: item.is_pinned === true,
        is_muted: item.is_muted === true,
        is_archived: item.is_archived === true,
      },
    ]
  })
}
