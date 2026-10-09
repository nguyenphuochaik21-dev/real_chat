import type { Json } from '@/types/database'
import type { PublicProfile, Tables } from '@/types'

type Message = Tables<'messages'>

export interface ConversationSummary extends Tables<'conversations'> {
  ai_agent_name: string | null
  participant: PublicProfile | null
  group_members: PublicProfile[]
  last_message: Message | null
  unread_count: number
  member_count: number
  is_pinned: boolean
  is_muted: boolean
  is_archived: boolean
}

export interface ConversationSummaryPage {
  items: ConversationSummary[]
  totalCount: number
  hasMore: boolean
}

export type ConversationSummaryTab = 'all' | 'unread' | 'groups' | 'archived'

interface ConversationSummaryPageOptions {
  offset: number
  limit: number
  tab: ConversationSummaryTab
  query?: string
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
        type: item.type === 'ai' ? 'ai' : item.type === 'group' ? 'group' : 'direct',
        title: nullableString(item.title),
        avatar_url: nullableString(item.avatar_url),
        created_by: nullableString(item.created_by),
        ai_agent_id: nullableString(item.ai_agent_id),
        ai_agent_name: nullableString(item.ai_agent_name),
        join_requires_approval: item.join_requires_approval === true,
        last_message_at: nullableString(item.last_message_at),
        share_token: nullableString(item.share_token),
        created_at: nullableString(item.created_at),
        updated_at: nullableString(item.updated_at),
        participant: isRecord(item.participant) ? (item.participant as PublicProfile) : null,
        group_members: [],
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

export function parseConversationSummaryPage(value: Json | null): ConversationSummaryPage {
  if (!isRecord(value)) return { items: [], totalCount: 0, hasMore: false }

  return {
    items: parseConversationSummaries(Array.isArray(value.items) ? (value.items as Json) : null),
    totalCount:
      typeof value.total_count === 'number' && Number.isFinite(value.total_count)
        ? Math.max(0, value.total_count)
        : 0,
    hasMore: value.has_more === true,
  }
}

export function isMissingConversationPageRpc(error: { code?: string; message?: string }): boolean {
  if (error.code === 'PGRST202' || error.code === '42883') return true

  const message = error.message?.toLowerCase() ?? ''
  return (
    message.includes('get_conversation_summaries_page') &&
    (message.includes('schema cache') ||
      message.includes('does not exist') ||
      message.includes('not found'))
  )
}

export function paginateConversationSummaries(
  conversations: ConversationSummary[],
  { offset, limit, tab, query = '' }: ConversationSummaryPageOptions
): ConversationSummaryPage {
  const normalizedQuery = query.trim().toLowerCase()
  const usernameQuery = normalizedQuery.replace(/^@+/, '')
  const filtered = conversations
    .filter((conversation) => {
      if (tab === 'archived') return conversation.is_archived
      if (conversation.is_archived) return false
      if (tab === 'groups' && conversation.type !== 'group') return false
      if (tab === 'unread' && conversation.unread_count === 0) return false
      if (!normalizedQuery) return true

      return (
        conversation.title?.toLowerCase().includes(normalizedQuery) === true ||
        conversation.ai_agent_name?.toLowerCase().includes(normalizedQuery) === true ||
        conversation.participant?.display_name.toLowerCase().includes(normalizedQuery) === true ||
        (usernameQuery.length > 0 &&
          conversation.participant?.username?.toLowerCase().includes(usernameQuery) === true)
      )
    })
    .sort((left, right) => {
      if (left.is_pinned !== right.is_pinned) return left.is_pinned ? -1 : 1
      const leftActivity = [left.last_message?.created_at, left.last_message_at]
        .filter((date): date is string => Boolean(date))
        .sort()
        .at(-1)
      const rightActivity = [right.last_message?.created_at, right.last_message_at]
        .filter((date): date is string => Boolean(date))
        .sort()
        .at(-1)
      return (
        (rightActivity ?? '').localeCompare(leftActivity ?? '') || right.id.localeCompare(left.id)
      )
    })

  return {
    items: filtered.slice(offset, offset + limit),
    totalCount: tab === 'archived' ? filtered.length : 0,
    hasMore: offset + limit < filtered.length,
  }
}
