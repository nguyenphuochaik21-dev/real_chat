'use server'

import { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/types'
import { parseConversationSummaries } from '@/lib/conversation-summary'

export type Message = Tables<'messages'>

export interface SearchResult {
  id: string
  content: string
  conversation_id: string | null
  sender_id: string | null
  created_at: string | null
  content_type: string | null
  media_url: string | null
  media_name: string | null
  relevance: number
  conversation_title: string | null
}

export interface SearchFilters {
  conversationId?: string
  senderId?: string
  dateFrom?: string
  dateTo?: string
}

export interface SearchResults {
  results: SearchResult[]
  total: number
  query: string
}

export async function searchMessages(
  query: string,
  filters: SearchFilters = {},
  limit = 50,
  offset = 0
): Promise<SearchResults> {
  if (!query.trim()) {
    return { results: [], total: 0, query: '' }
  }

  const supabase = await createClient()

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Not authenticated')
  }

  try {
    // Use the search_messages function via RPC
    const { data, error } = await supabase.rpc('search_messages', {
      p_user_id: user.id,
      p_query: query,
      p_conversation_id: filters.conversationId || null,
      p_sender_id: filters.senderId || null,
      p_date_from: filters.dateFrom || null,
      p_date_to: filters.dateTo || null,
      p_limit: limit,
      p_offset: offset,
    })

    if (error) {
      console.error('Search error:', error)
      // Fallback to basic search if function not available
      return fallbackSearch(supabase, user.id, query, filters, limit, offset)
    }

    return {
      results: data || [],
      total: (data || []).length,
      query,
    }
  } catch (err) {
    console.error('Search error:', err)
    throw err
  }
}

// Fallback search using basic ilike if function not available
async function fallbackSearch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  query: string,
  filters: SearchFilters,
  limit: number,
  offset: number
): Promise<SearchResults> {
  // First get all conversations the user is part of
  const { data: participations } = await supabase
    .from('conversation_participants')
    .select('conversation_id')
    .eq('user_id', userId)

  const conversationIds = participations?.map((p) => p.conversation_id) || []

  if (conversationIds.length === 0) {
    return { results: [], total: 0, query }
  }

  const { data: summaries } = await supabase.rpc('get_conversation_summaries')
  const conversationsMap = new Map(
    parseConversationSummaries(summaries).map((conversation) => [
      conversation.id,
      conversation.type === 'group'
        ? conversation.title || 'Group'
        : conversation.participant?.display_name || 'Unknown',
    ])
  )

  // Build query for messages
  let dbQuery = supabase
    .from('messages')
    .select('*', { count: 'exact' })
    .in('conversation_id', conversationIds)
    .ilike('content', `%${query}%`)
    .is('deleted_at', null)

  if (filters.conversationId) {
    dbQuery = dbQuery.eq('conversation_id', filters.conversationId)
  }

  if (filters.senderId) {
    dbQuery = dbQuery.eq('sender_id', filters.senderId)
  }

  if (filters.dateFrom) {
    dbQuery = dbQuery.gte('created_at', filters.dateFrom)
  }

  if (filters.dateTo) {
    dbQuery = dbQuery.lte('created_at', filters.dateTo)
  }

  const { data, error, count } = await dbQuery
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw error

  // Transform results with conversation titles
  const results: SearchResult[] = (data || []).map((msg) => ({
    id: msg.id,
    content: msg.content,
    conversation_id: msg.conversation_id,
    sender_id: msg.sender_id,
    created_at: msg.created_at,
    content_type: msg.content_type,
    media_url: msg.media_url,
    media_name: msg.media_name,
    relevance: 1,
    conversation_title: msg.conversation_id
      ? conversationsMap.get(msg.conversation_id) || null
      : null,
  }))

  return {
    results,
    total: count || 0,
    query,
  }
}

export async function searchConversations(query: string): Promise<Tables<'profiles'>[]> {
  if (!query.trim()) return []

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  // Search profiles (contacts)
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .or(`display_name.ilike.%${query}%,username.ilike.%${query}%`)
    .neq('id', user.id)
    .limit(10)

  if (error) {
    console.error('Search conversations error:', error)
    return []
  }

  return data || []
}
