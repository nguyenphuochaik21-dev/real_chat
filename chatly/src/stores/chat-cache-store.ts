'use client'

import { create } from 'zustand'
import type { PublicProfile, Tables } from '@/types'

type Message = Tables<'messages'>

interface ConversationCache {
  messages: Message[]
  hasOlderMessages: boolean
  participant: PublicProfile | null
  participantStatus: 'online' | 'offline' | 'away' | 'busy'
  messageStatuses: Map<string, string>
  messageReactions: Map<string, { emoji: string; count: number; userReacted: boolean }[]>
  lastFetchedAt: number
}

const MAX_CACHED_CONVERSATIONS = 10
const MAX_CACHED_MESSAGES = 200
const MAX_CACHED_INPUTS = 50

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
        hasOlderMessages: true,
        participant: null,
        participantStatus: 'offline' as const,
        messageStatuses: new Map(),
        messageReactions: new Map(),
        lastFetchedAt: 0,
      }
      const nextCache = { ...existing, ...partial, lastFetchedAt: Date.now() }
      if (nextCache.messages.length > MAX_CACHED_MESSAGES) {
        nextCache.messages = nextCache.messages.slice(-MAX_CACHED_MESSAGES)
        nextCache.hasOlderMessages = true
      }
      newCache.set(conversationId, nextCache)

      if (newCache.size > MAX_CACHED_CONVERSATIONS) {
        const oldestEntry = [...newCache.entries()]
          .filter(([id]) => id !== conversationId)
          .sort(([, left], [, right]) => left.lastFetchedAt - right.lastFetchedAt)[0]
        if (oldestEntry) newCache.delete(oldestEntry[0])
      }
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
      newInputs.delete(conversationId)
      if (value) newInputs.set(conversationId, value)
      if (newInputs.size > MAX_CACHED_INPUTS) {
        const oldestConversationId = newInputs.keys().next().value
        if (oldestConversationId) newInputs.delete(oldestConversationId)
      }
      return { inputValues: newInputs }
    })
  },
}))
