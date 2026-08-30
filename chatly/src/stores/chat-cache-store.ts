'use client'

import { create } from 'zustand'
import type { Tables } from '@/types'

type Message = Tables<'messages'>
type Profile = Tables<'profiles'>

interface ConversationCache {
  messages: Message[]
  participant: Profile | null
  participantStatus: 'online' | 'offline' | 'away' | 'busy'
  messageStatuses: Map<string, string>
  messageReactions: Map<string, { emoji: string; count: number; userReacted: boolean }[]>
  lastFetchedAt: number
}

interface ChatCacheStore {
  cache: Map<string, ConversationCache>
  inputValues: Map<string, string>
  getCached: (conversationId: string) => ConversationCache | undefined
  setCached: (conversationId: string, cache: Partial<ConversationCache>) => void
  clearCache: (conversationId: string) => void
  getInput: (conversationId: string) => string
  setInput: (conversationId: string, value: string) => void
}

export const useChatCacheStore = create<ChatCacheStore>((set, get) => ({
  cache: new Map(),
  inputValues: new Map(),

  getCached: (conversationId) => {
    return get().cache.get(conversationId)
  },

  setCached: (conversationId, partial) => {
    set((state) => {
      const newCache = new Map(state.cache)
      const existing = newCache.get(conversationId) || {
        messages: [],
        participant: null,
        participantStatus: 'offline' as const,
        messageStatuses: new Map(),
        messageReactions: new Map(),
        lastFetchedAt: 0,
      }
      newCache.set(conversationId, { ...existing, ...partial, lastFetchedAt: Date.now() })
      return { cache: newCache }
    })
  },

  clearCache: (conversationId) => {
    set((state) => {
      const newCache = new Map(state.cache)
      newCache.delete(conversationId)
      return { cache: newCache }
    })
  },

  getInput: (conversationId) => {
    return get().inputValues.get(conversationId) || ''
  },

  setInput: (conversationId, value) => {
    set((state) => {
      const newInputs = new Map(state.inputValues)
      newInputs.set(conversationId, value)
      return { inputValues: newInputs }
    })
  },
}))
