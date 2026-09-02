'use client'

import { useCallback, useRef, useState } from 'react'
import { searchMessages, searchConversations, type SearchFilters } from '@/lib/actions/search'
import type { PublicProfile, SearchResult } from '@/lib/actions/search'

export type { SearchResult }
export type Profile = PublicProfile

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
  const conversationIdRef = useRef(conversationId)
  const stateRef = useRef(state)
  conversationIdRef.current = conversationId
  stateRef.current = state

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasMoreRef = useRef(true)
  const messageRequestRef = useRef(0)
  const contactRequestRef = useRef(0)
  const messageLoadingRef = useRef(false)
  const contactLoadingRef = useRef(false)

  const search = useCallback(async (query: string) => {
    const requestId = ++messageRequestRef.current
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!query.trim()) {
      messageLoadingRef.current = false
      setState((previous) => ({
        ...previous,
        query: '',
        results: [],
        total: 0,
        loading: contactLoadingRef.current,
      }))
      hasMoreRef.current = true
      return
    }

    messageLoadingRef.current = true
    setState((previous) => ({ ...previous, loading: true, error: null }))
    debounceRef.current = setTimeout(async () => {
      try {
        const filters = {
          ...stateRef.current.filters,
          ...(conversationIdRef.current ? { conversationId: conversationIdRef.current } : {}),
        }
        const results = await searchMessages(query, filters, PAGE_SIZE, 0)
        if (requestId !== messageRequestRef.current) return

        messageLoadingRef.current = false
        setState((previous) => ({
          ...previous,
          query,
          results: results.results,
          total: results.total,
          loading: contactLoadingRef.current,
        }))
        hasMoreRef.current = results.results.length < results.total
      } catch (error) {
        if (requestId !== messageRequestRef.current) return
        messageLoadingRef.current = false
        setState((previous) => ({
          ...previous,
          loading: contactLoadingRef.current,
          error: error instanceof Error ? error.message : 'Search failed',
        }))
      }
    }, DEBOUNCE_MS)
  }, [])

  const searchContacts = useCallback(async (query: string) => {
    const requestId = ++contactRequestRef.current
    if (!query.trim()) {
      contactLoadingRef.current = false
      setState((previous) => ({
        ...previous,
        contacts: [],
        loading: messageLoadingRef.current,
        error: null,
      }))
      return
    }

    contactLoadingRef.current = true
    setState((previous) => ({ ...previous, loading: true, error: null }))
    try {
      const contacts = await searchConversations(query)
      if (requestId !== contactRequestRef.current) return
      contactLoadingRef.current = false
      setState((previous) => ({
        ...previous,
        contacts,
        loading: messageLoadingRef.current,
      }))
    } catch (error) {
      if (requestId !== contactRequestRef.current) return
      contactLoadingRef.current = false
      setState((previous) => ({
        ...previous,
        loading: messageLoadingRef.current,
        error: error instanceof Error ? error.message : 'Contact search failed',
      }))
    }
  }, [])

  const setFilters = useCallback(
    (filters: SearchFilters) => {
      const nextFilters = {
        ...filters,
        ...(conversationIdRef.current ? { conversationId: conversationIdRef.current } : {}),
      }
      const currentQuery = stateRef.current.query
      stateRef.current = { ...stateRef.current, filters: nextFilters }
      setState((previous) => ({ ...previous, filters: nextFilters }))
      if (currentQuery) void search(currentQuery)
    },
    [search]
  )

  const clearSearch = useCallback(() => {
    messageRequestRef.current += 1
    contactRequestRef.current += 1
    messageLoadingRef.current = false
    contactLoadingRef.current = false
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setState({
      query: '',
      results: [],
      contacts: [],
      loading: false,
      error: null,
      total: 0,
      filters: conversationIdRef.current ? { conversationId: conversationIdRef.current } : {},
    })
    hasMoreRef.current = true
  }, [])

  const loadMore = useCallback(async () => {
    if (messageLoadingRef.current || !hasMoreRef.current || !stateRef.current.query) return

    const requestId = ++messageRequestRef.current
    messageLoadingRef.current = true
    setState((previous) => ({ ...previous, loading: true }))
    try {
      const filters = {
        ...stateRef.current.filters,
        ...(conversationIdRef.current ? { conversationId: conversationIdRef.current } : {}),
      }
      const previousCount = stateRef.current.results.length
      const results = await searchMessages(
        stateRef.current.query,
        filters,
        PAGE_SIZE,
        previousCount
      )
      if (requestId !== messageRequestRef.current) return

      messageLoadingRef.current = false
      setState((previous) => ({
        ...previous,
        results: [...previous.results, ...results.results],
        total: results.total,
        loading: contactLoadingRef.current,
      }))
      hasMoreRef.current = previousCount + results.results.length < results.total
    } catch (error) {
      if (requestId !== messageRequestRef.current) return
      messageLoadingRef.current = false
      setState((previous) => ({
        ...previous,
        loading: contactLoadingRef.current,
        error: error instanceof Error ? error.message : 'Load more failed',
      }))
    }
  }, [])

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
