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
  ownerUserId: string | null
  conversations: ConversationWithDetails[]
  archivedConversations: ConversationWithDetails[]
  participantStatuses: Map<string, ParticipantStatus>
  blockedUserIds: Set<string>
  loading: boolean
  lastFetchedAt: number

  beginUserSession: (userId: string) => void
  reset: () => void
  setAll: (
    userId: string,
    data: {
      conversations: ConversationWithDetails[]
      archivedConversations: ConversationWithDetails[]
      participantStatuses: Map<string, ParticipantStatus>
    }
  ) => void
  setLoading: (userId: string, loading: boolean) => void
  setBlockedUserIds: (userId: string, ids: Set<string>) => void
  markUserBlocked: (blockedUserId: string) => void
  unmarkUserBlocked: (blockedUserId: string) => void

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

const initialState = {
  ownerUserId: null,
  conversations: [],
  archivedConversations: [],
  participantStatuses: new Map<string, ParticipantStatus>(),
  blockedUserIds: new Set<string>(),
  loading: false,
  lastFetchedAt: 0,
}

export const useChatsListStore = create<ChatsListStore>((set) => ({
  ...initialState,

  beginUserSession: (userId) =>
    set((state) =>
      state.ownerUserId === userId
        ? state
        : {
            ...initialState,
            ownerUserId: userId,
            loading: true,
          }
    ),

  reset: () => set(initialState),

  setAll: (userId, data) =>
    set((state) => {
      if (state.ownerUserId !== userId) return state

      const isVisible = (conversation: ConversationWithDetails) =>
        conversation.type !== 'direct' ||
        !conversation.participant ||
        !state.blockedUserIds.has(conversation.participant.id)

      return {
        conversations: data.conversations.filter(isVisible),
        archivedConversations: data.archivedConversations.filter(isVisible),
        participantStatuses: data.participantStatuses,
        lastFetchedAt: Date.now(),
      }
    }),

  setLoading: (userId, loading) =>
    set((state) => (state.ownerUserId === userId ? { loading } : state)),

  setBlockedUserIds: (userId, ids) =>
    set((state) => {
      if (state.ownerUserId !== userId) return state
      const isVisible = (conversation: ConversationWithDetails) =>
        conversation.type !== 'direct' ||
        !conversation.participant ||
        !ids.has(conversation.participant.id)

      return {
        blockedUserIds: ids,
        conversations: state.conversations.filter(isVisible),
        archivedConversations: state.archivedConversations.filter(isVisible),
      }
    }),

  markUserBlocked: (blockedUserId) =>
    set((state) => {
      const blockedUserIds = new Set(state.blockedUserIds)
      blockedUserIds.add(blockedUserId)
      const isVisible = (conversation: ConversationWithDetails) =>
        conversation.type !== 'direct' || conversation.participant?.id !== blockedUserId
      const participantStatuses = new Map(state.participantStatuses)
      participantStatuses.delete(blockedUserId)

      return {
        blockedUserIds,
        conversations: state.conversations.filter(isVisible),
        archivedConversations: state.archivedConversations.filter(isVisible),
        participantStatuses,
      }
    }),

  unmarkUserBlocked: (blockedUserId) =>
    set((state) => {
      const blockedUserIds = new Set(state.blockedUserIds)
      blockedUserIds.delete(blockedUserId)
      return { blockedUserIds, lastFetchedAt: 0 }
    }),

  upsertConversation: (conv) =>
    set((state) => {
      if (
        conv.type === 'direct' &&
        conv.participant &&
        state.blockedUserIds.has(conv.participant.id)
      ) {
        return state
      }
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
