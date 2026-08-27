'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  createLabel,
  updateLabel,
  deleteLabel,
  getLabels,
  assignLabelToConversation,
  removeLabelFromConversation,
  getConversationLabels,
  getLabelsForConversations,
} from '@/lib/actions/labels'
import type { Tables } from '@/types'

type Label = Tables<'conversation_labels'>

interface ConversationLabelsContextValue {
  labels: Label[]
  conversationLabels: Map<string, Label[]>
  loading: boolean
  error: string | null
  createLabel: (name: string, color: string) => Promise<{ success: boolean; label?: Label; error?: string }>
  updateLabel: (id: string, name?: string, color?: string) => Promise<{ success: boolean; error?: string }>
  deleteLabel: (id: string) => Promise<{ success: boolean; error?: string }>
  assignLabel: (conversationId: string, labelId: string) => Promise<{ success: boolean; error?: string }>
  removeLabel: (conversationId: string, labelId: string) => Promise<{ success: boolean; error?: string }>
  getConversationLabelList: (conversationId: string) => Label[]
  loadLabelsForConversations: (conversationIds: string[]) => Promise<void>
  refetch: () => void
}

const ConversationLabelsContext = createContext<ConversationLabelsContextValue | null>(null)

// Singleton Supabase client for this module
const supabase = createClient()

function ConversationLabelsProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [labels, setLabels] = useState<Label[]>([])
  const [conversationLabels, setConversationLabels] = useState<Map<string, Label[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Refs to avoid stale closures
  const labelsRef = useRef(labels)
  const conversationLabelsRef = useRef(conversationLabels)
  const setConversationLabelsRef = useRef(setConversationLabels)
  const channelSubscribed = useRef(false)

  labelsRef.current = labels
  conversationLabelsRef.current = conversationLabels
  setConversationLabelsRef.current = setConversationLabels

  const fetchLabels = useCallback(async () => {
    if (!userId) {
      setLabels([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const result = await getLabels()
      if (result.success && result.labels) {
        setLabels(result.labels)
      } else {
        setError(result.error || 'Failed to fetch labels')
      }
    } catch (err) {
      console.error('Failed to fetch labels:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [userId])

  // Initial fetch
  useEffect(() => {
    fetchLabels()
  }, [fetchLabels])

  // Subscribe to label changes - ONLY ONCE when userId is available
  useEffect(() => {
    if (!userId || channelSubscribed.current) return

    const channel = supabase
      .channel(`labels-global-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_labels',
        },
        async () => {
          const result = await getLabels()
          if (result.success && result.labels) {
            setLabels(result.labels)
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_label_map',
        },
        async () => {
          const conversationIds = Array.from(conversationLabelsRef.current.keys())
          if (conversationIds.length > 0) {
            const result = await getLabelsForConversations(conversationIds)
            if (result.success && result.labelsByConversation) {
              setConversationLabelsRef.current(result.labelsByConversation)
            }
          }
        }
      )

    channel.subscribe()
    channelSubscribed.current = true

    return () => {
      channelSubscribed.current = false
      supabase.removeChannel(channel)
    }
  }, [userId])

  const loadLabelsForConversations = useCallback(async (conversationIds: string[]) => {
    if (conversationIds.length === 0) return

    try {
      const result = await getLabelsForConversations(conversationIds)
      if (result.success && result.labelsByConversation) {
        setConversationLabels(result.labelsByConversation)
      }
    } catch (err) {
      console.error('Failed to load labels for conversations:', err)
    }
  }, [])

  const createLabelFn = useCallback(async (name: string, color: string) => {
    try {
      const result = await createLabel({ name, color })
      if (result.success && result.label) {
        setLabels(prev => [...prev, result.label!])
        return { success: true, label: result.label }
      } else {
        return { success: false, error: result.error }
      }
    } catch (err) {
      console.error('Failed to create label:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }, [])

  const updateLabelFn = useCallback(async (id: string, name?: string, color?: string) => {
    try {
      const result = await updateLabel({ id, name, color })
      if (result.success) {
        setLabels(prev => prev.map(l => l.id === id ? { ...l, name: name ?? l.name, color: color ?? l.color } : l))
        return { success: true }
      } else {
        return { success: false, error: result.error }
      }
    } catch (err) {
      console.error('Failed to update label:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }, [])

  const deleteLabelFn = useCallback(async (id: string) => {
    try {
      const result = await deleteLabel(id)
      if (result.success) {
        setLabels(prev => prev.filter(l => l.id !== id))
        setConversationLabels(prev => {
          const next = new Map(prev)
          next.forEach((convLabels, convId) => {
            const filtered = convLabels.filter(l => l.id !== id)
            next.set(convId, filtered)
          })
          return next
        })
        return { success: true }
      } else {
        return { success: false, error: result.error }
      }
    } catch (err) {
      console.error('Failed to delete label:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }, [])

  const assignLabelFn = useCallback(async (conversationId: string, labelId: string) => {
    try {
      const result = await assignLabelToConversation(conversationId, labelId)
      if (result.success) {
        const label = labelsRef.current.find(l => l.id === labelId)
        if (label) {
          setConversationLabels(prev => {
            const next = new Map(prev)
            const existing = next.get(conversationId) || []
            if (!existing.some(l => l.id === labelId)) {
              next.set(conversationId, [...existing, label])
            }
            return next
          })
        }
        return { success: true }
      } else {
        return { success: false, error: result.error }
      }
    } catch (err) {
      console.error('Failed to assign label:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }, [])

  const removeLabelFn = useCallback(async (conversationId: string, labelId: string) => {
    try {
      const result = await removeLabelFromConversation(conversationId, labelId)
      if (result.success) {
        setConversationLabels(prev => {
          const next = new Map(prev)
          const existing = next.get(conversationId) || []
          next.set(conversationId, existing.filter(l => l.id !== labelId))
          return next
        })
        return { success: true }
      } else {
        return { success: false, error: result.error }
      }
    } catch (err) {
      console.error('Failed to remove label:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
  }, [])

  const getConversationLabelList = useCallback((conversationId: string): Label[] => {
    return conversationLabels.get(conversationId) || []
  }, [conversationLabels])

  const value: ConversationLabelsContextValue = {
    labels,
    conversationLabels,
    loading,
    error,
    createLabel: createLabelFn,
    updateLabel: updateLabelFn,
    deleteLabel: deleteLabelFn,
    assignLabel: assignLabelFn,
    removeLabel: removeLabelFn,
    getConversationLabelList,
    loadLabelsForConversations,
    refetch: fetchLabels,
  }

  return (
    <ConversationLabelsContext.Provider value={value}>
      {children}
    </ConversationLabelsContext.Provider>
  )
}

export function useConversationLabels(userId?: string | null): ConversationLabelsContextValue {
  const context = useContext(ConversationLabelsContext)

  if (!context) {
    throw new Error('useConversationLabels must be used within ConversationLabelsProvider')
  }

  return context
}

// Export provider for use in layout/pages
export { ConversationLabelsProvider }
