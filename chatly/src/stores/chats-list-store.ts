'use client'

import { create } from 'zustand'
import type { Tables } from '@/types'
import type { PresenceStatus } from '@/lib/presence'
import type { ConversationSummary } from '@/lib/conversation-summary'

type Message = Tables<'messages'>

export interface ParticipantStatus {
  status: PresenceStatus
  lastSeen: string | null
}

export type ConversationWithDetails = ConversationSummary

interface ChatsListStore {
  conversations: ConversationWithDetails[]
  archivedConversations: ConversationWithDetails[]
  participantStatuses: Map<string, ParticipantStatus>
  blockedUserIds: Set<string>
  loading: boolean
  lastFetchedAt: number

  setAll: (data: {
    conversations: ConversationWithDetails[]
    archivedConversations: ConversationWithDetails[]
    participantStatuses: Map<string, ParticipantStatus>
    blockedUserIds: Set<string>
  }) => void
  setLoading: (loading: boolean) => void
  setBlockedUserIds: (ids: Set<string>) => void

  // Per-conversation updates
  upsertConversation: (conv: ConversationWithDetails) => void
  moveToArchived: (id: string) => void
  moveToActive: (id: string) => void
  removeConversation: (id: string) => void
  updateConversation: (id: string, patch: Partial<ConversationWithDetails>) => void
  incrementUnread: (id: string, lastMessage: Message | null, fromOther: boolean) => void
  updateLastMessage: (id: string, lastMessage: Message | null) => void
  setParticipantStatus: (userId: string, status: PresenceStatus, lastSeen?: string | null) => void
}

export const useChatsListStore = create<ChatsListStore>((set) => ({
  conversations: [],
  archivedConversations: [],
  participantStatuses: new Map(),
  blockedUserIds: new Set(),
  loading: false,
  lastFetchedAt: 0,

  setAll: (data) =>
    set({
      conversations: data.conversations,
      archivedConversations: data.archivedConversations,
      participantStatuses: data.participantStatuses,
      blockedUserIds: data.blockedUserIds,
      lastFetchedAt: Date.now(),
    }),

  setLoading: (loading) => set({ loading }),

  setBlockedUserIds: (ids) => set({ blockedUserIds: ids }),

  upsertConversation: (conv) =>
    set((state) => {
      const existsInActive = state.conversations.some((c) => c.id === conv.id)
      const existsInArchived = state.archivedConversations.some((c) => c.id === conv.id)

      if (conv.is_archived) {
        const archived = existsInArchived
          ? state.archivedConversations.map((c) => (c.id === conv.id ? conv : c))
          : [...state.archivedConversations, conv]
        const active = state.conversations.filter((c) => c.id !== conv.id)
        return { conversations: active, archivedConversations: archived }
      }

      const active = existsInActive
        ? state.conversations.map((c) => (c.id === conv.id ? conv : c))
        : [...state.conversations, conv]
      const archived = state.archivedConversations.filter((c) => c.id !== conv.id)
      return { conversations: active, archivedConversations: archived }
    }),

  moveToArchived: (id) =>
    set((state) => {
      const conv = state.conversations.find((c) => c.id === id)
      if (!conv) return state
      const archived = { ...conv, is_archived: true }
      return {
        conversations: state.conversations.filter((c) => c.id !== id),
        archivedConversations: [...state.archivedConversations, archived],
      }
    }),

  moveToActive: (id) =>
    set((state) => {
      const conv = state.archivedConversations.find((c) => c.id === id)
      if (!conv) return state
      const active = { ...conv, is_archived: false }
      return {
        conversations: [...state.conversations, active],
        archivedConversations: state.archivedConversations.filter((c) => c.id !== id),
      }
    }),

  removeConversation: (id) =>
    set((state) => ({
      conversations: state.conversations.filter((conversation) => conversation.id !== id),
      archivedConversations: state.archivedConversations.filter(
        (conversation) => conversation.id !== id
      ),
    })),

  updateConversation: (id, patch) =>
    set((state) => ({
      conversations: state.conversations.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      archivedConversations: state.archivedConversations.map((c) =>
        c.id === id ? { ...c, ...patch } : c
      ),
    })),

  incrementUnread: (id, lastMessage, fromOther) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id
          ? {
              ...c,
              unread_count: fromOther ? c.unread_count + 1 : c.unread_count,
              last_message: lastMessage ?? c.last_message,
            }
          : c
      ),
      archivedConversations: state.archivedConversations.map((c) =>
        c.id === id
          ? {
              ...c,
              unread_count: fromOther ? c.unread_count + 1 : c.unread_count,
              last_message: lastMessage ?? c.last_message,
            }
          : c
      ),
    })),

  updateLastMessage: (id, lastMessage) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, last_message: lastMessage } : c
      ),
      archivedConversations: state.archivedConversations.map((c) =>
        c.id === id ? { ...c, last_message: lastMessage } : c
      ),
    })),

  setParticipantStatus: (userId, status, lastSeen) =>
    set((state) => {
      const next = new Map(state.participantStatuses)
      const prev = next.get(userId)
      next.set(userId, {
        status,
        lastSeen: lastSeen ?? prev?.lastSeen ?? null,
      })
      return { participantStatuses: next }
    }),
}))
