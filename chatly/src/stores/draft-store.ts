'use client'

import { create } from 'zustand'

const DRAFT_STORAGE_KEY = 'chatly_drafts'
const DRAFT_SAVE_INTERVAL = 5000 // 5 seconds

interface DraftStore {
  drafts: Map<string, string>
  pendingSaves: Map<string, NodeJS.Timeout>
  _hasHydrated: boolean
  _init: () => void
  setDraft: (conversationId: string, content: string) => void
  getDraft: (conversationId: string) => string
  clearDraft: (conversationId: string) => void
  clearAllDrafts: () => void
  _loadDrafts: () => void
  _saveDrafts: () => void
}

export const useDraftStore = create<DraftStore>((set, get) => ({
  drafts: new Map(),
  pendingSaves: new Map(),
  _hasHydrated: false,

  _init: () => {
    if (typeof window === 'undefined') return
    get()._loadDrafts()
  },

  setDraft: (conversationId: string, content: string) => {
    const { drafts, pendingSaves, _saveDrafts } = get()

    // Update state immediately
    set(state => {
      const newDrafts = new Map(state.drafts)
      if (content.trim()) {
        newDrafts.set(conversationId, content)
      } else {
        newDrafts.delete(conversationId)
      }
      return { drafts: newDrafts }
    })

    // Clear existing pending save for this conversation
    const existingTimeout = pendingSaves.get(conversationId)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    // Schedule a debounced save
    const timeoutId = setTimeout(() => {
      _saveDrafts()
      set(state => {
        const newPending = new Map(state.pendingSaves)
        newPending.delete(conversationId)
        return { pendingSaves: newPending }
      })
    }, DRAFT_SAVE_INTERVAL)

    set(state => {
      const newPending = new Map(state.pendingSaves)
      newPending.set(conversationId, timeoutId)
      return { pendingSaves: newPending }
    })
  },

  getDraft: (conversationId: string) => {
    const { drafts } = get()
    return drafts.get(conversationId) || ''
  },

  clearDraft: (conversationId: string) => {
    const { pendingSaves, _saveDrafts } = get()

    // Clear pending save
    const existingTimeout = pendingSaves.get(conversationId)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    // Remove from state
    set(state => {
      const newDrafts = new Map(state.drafts)
      newDrafts.delete(conversationId)
      return { drafts: newDrafts }
    })

    // Save immediately
    _saveDrafts()

    set(state => {
      const newPending = new Map(state.pendingSaves)
      newPending.delete(conversationId)
      return { pendingSaves: newPending }
    })
  },

  clearAllDrafts: () => {
    const { pendingSaves } = get()

    // Clear all pending saves
    pendingSaves.forEach(timeoutId => clearTimeout(timeoutId))

    set({
      drafts: new Map(),
      pendingSaves: new Map(),
    })

    if (typeof window !== 'undefined') {
      localStorage.removeItem(DRAFT_STORAGE_KEY)
    }
  },

  _loadDrafts: () => {
    if (typeof window === 'undefined') return

    try {
      const stored = localStorage.getItem(DRAFT_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, string>
        const drafts = new Map<string, string>()
        Object.entries(parsed).forEach(([key, value]) => {
          if (typeof value === 'string') {
            drafts.set(key, value)
          }
        })
        set({ drafts, _hasHydrated: true })
      } else {
        set({ _hasHydrated: true })
      }
    } catch (err) {
      console.error('Failed to load drafts from localStorage:', err)
      set({ _hasHydrated: true })
    }
  },

  _saveDrafts: () => {
    if (typeof window === 'undefined') return

    try {
      const { drafts } = get()
      const obj: Record<string, string> = {}
      drafts.forEach((content, conversationId) => {
        obj[conversationId] = content
      })
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(obj))
    } catch (err) {
      console.error('Failed to save drafts to localStorage:', err)
    }
  },
}))

// Initialize on client-side mount
if (typeof window !== 'undefined') {
  setTimeout(() => {
    useDraftStore.getState()._init()
  }, 0)
}
