'use client'

import { useState, useCallback, useRef } from 'react'
import { searchMessages, searchConversations, type SearchFilters } from '@/lib/actions/search'
import type { SearchResult } from '@/lib/actions/search'
import type { Tables } from '@/types'

export type { SearchResult }
export type Profile = Tables<'profiles'>

export interface SearchState {
  query: string
  results: SearchResult[]
  contacts: Profile[]
  loading: boolean
  error: string | null
  total: number
  filters: SearchFilters
}

export interface UseSearchReturn {
  state: SearchState
  search: (query: string) => Promise<void>
  searchContacts: (query: string) => Promise<void>
  setFilters: (filters: SearchFilters) => void
  clearSearch: () => void
  loadMore: () => Promise<void>
  hasMore: boolean
}

const DEBOUNCE_MS = 300
const PAGE_SIZE = 50

export function useSearch(conversationId?: string): UseSearchReturn {
  const [state, setState] = useState<SearchState>({
    query: '',
    results: [],
    contacts: [],
    loading: false,
    error: null,
    total: 0,
    filters: conversationId ? { conversationId } : {},
  })

  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const hasMoreRef = useRef(true)

  const search = useCallback(async (query: string) => {
    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (!query.trim()) {
      setState(prev => ({
        ...prev,
        query: '',
        results: [],
        total: 0,
        loading: false,
      }))
      hasMoreRef.current = true
      return
    }

    setState(prev => ({ ...prev, loading: true, error: null }))

    // Debounce the search
    debounceRef.current = setTimeout(async () => {
      try {
        const filters = conversationId ? { conversationId } : state.filters
        const results = await searchMessages(query, filters, PAGE_SIZE, 0)

        setState(prev => ({
          ...prev,
          query,
          results: results.results,
          total: results.total,
          loading: false,
        }))
        hasMoreRef.current = results.results.length < results.total
      } catch (err) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Search failed',
        }))
      }
    }, DEBOUNCE_MS)
  }, [conversationId, state.filters])

  const searchContacts = useCallback(async (query: string) => {
    if (!query.trim()) {
      setState(prev => ({ ...prev, contacts: [] }))
      return
    }

    try {
      const contacts = await searchConversations(query)
      setState(prev => ({ ...prev, contacts }))
    } catch (err) {
      console.error('Contact search failed:', err)
    }
  }, [])

  const setFilters = useCallback((filters: SearchFilters) => {
    setState(prev => ({ ...prev, filters }))

    // Re-run search with new filters if we have a query
    if (state.query) {
      search(state.query)
    }
  }, [state.query, search])

  const clearSearch = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    setState({
      query: '',
      results: [],
      contacts: [],
      loading: false,
      error: null,
      total: 0,
      filters: conversationId ? { conversationId } : {},
    })
    hasMoreRef.current = true
  }, [conversationId])

  const loadMore = useCallback(async () => {
    if (state.loading || !hasMoreRef.current || !state.query) return

    setState(prev => ({ ...prev, loading: true }))

    try {
      const filters = conversationId ? { conversationId } : state.filters
      const results = await searchMessages(
        state.query,
        filters,
        PAGE_SIZE,
        state.results.length
      )

      setState(prev => ({
        ...prev,
        results: [...prev.results, ...results.results],
        total: results.total,
        loading: false,
      }))
      hasMoreRef.current = state.results.length + results.results.length < results.total
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Load more failed',
      }))
    }
  }, [state.loading, state.query, state.results.length, state.filters, conversationId])

  return {
    state,
    search,
    searchContacts,
    setFilters,
    clearSearch,
    loadMore,
    get hasMore() {
      return hasMoreRef.current && state.results.length < state.total
    },
  }
}
