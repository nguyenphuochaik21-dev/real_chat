'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { Search, Pin, BellOff, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/types'

type Message = Tables<'messages'>
type Profile = Tables<'profiles'>

interface ConversationWithDetails {
  id: string
  type: 'direct' | 'group'
  title: string | null
  avatar_url: string | null
  created_by: string | null
  last_message_at: string
  created_at: string
  updated_at: string
  participant: Profile
  last_message: Message | null
  unread_count: number
  is_pinned: boolean
  is_muted: boolean
}

function formatMessageTime(dateStr: string | null): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays === 1) {
    return 'Yesterday'
  } else if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' })
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

interface ConversationItemProps {
  conversation: ConversationWithDetails
  isActive: boolean
  currentUserId: string
  participantStatus: 'online' | 'offline' | 'away' | 'busy'
}

function ConversationItem({ conversation, isActive, currentUserId, participantStatus }: ConversationItemProps) {
  const isFromMe = conversation.last_message?.sender_id === currentUserId

  // Get status color for avatar
  const getStatusColor = (): string => {
    switch (participantStatus) {
      case 'online':
        return 'bg-emerald-500'
      case 'away':
        return 'bg-yellow-500'
      case 'busy':
        return 'bg-red-500'
      default:
        return 'bg-gray-400'
    }
  }

  return (
    <Link
      href={`/chats/${conversation.id}`}
      className={cn(
        'flex items-center gap-3 px-3 py-3 transition-colors',
        isActive ? 'bg-[var(--bg-active)]' : 'hover:bg-[var(--bg-hover)]',
        conversation.unread_count > 0 && !isActive && 'bg-[var(--bg-hover)]'
      )}
    >
      {/* Avatar with dynamic status from DB */}
      <div className="relative">
        <Avatar
          user={conversation.participant}
          size="lg"
          showStatus={false}
        />
        <span
          className={cn(
            'absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[var(--bg-panel)]',
            getStatusColor()
          )}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-[var(--text-primary)]">
              {conversation.participant.display_name}
            </span>
            {conversation.is_pinned && <Pin className="h-3.5 w-3.5 text-[var(--text-muted)]" />}
          </div>
          <span className="text-xs text-[var(--text-muted)]">
            {formatMessageTime(conversation.last_message?.created_at || conversation.last_message_at)}
          </span>
        </div>

        <div className="mt-0.5 flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-hidden">
            {conversation.is_muted && (
              <BellOff className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
            )}
            <p className="truncate text-sm text-[var(--text-secondary)]">
              {isFromMe && <span className="text-[var(--text-muted)]">You: </span>}
              {conversation.last_message?.content || 'No messages yet'}
            </p>
          </div>

          {conversation.unread_count > 0 && (
            <Badge variant="primary" size="sm">
              {conversation.unread_count}
            </Badge>
          )}
        </div>
      </div>
    </Link>
  )
}

interface ChatsListProps {
  selectedConversationId?: string | null
  currentUserId: string
}

type TabType = 'all' | 'unread' | 'personal'

export function ChatsList({ selectedConversationId, currentUserId }: ChatsListProps) {
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [conversations, setConversations] = useState<ConversationWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  // Track participant statuses from DB
  const [participantStatuses, setParticipantStatuses] = useState<Map<string, 'online' | 'offline' | 'away' | 'busy'>>(new Map())
  // Track conversation IDs in ref (for filtering in callbacks)
  const conversationIdsRef = useRef<string[]>([])
  const supabase = createClient()
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const statusChannelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)

  const fetchConversations = useCallback(async () => {
    if (!currentUserId) {
      setConversations([])
      setLoading(false)
      return
    }

    setLoading(true)

    try {
      // Get all conversations for this user
      const { data: participations, error: partError } = await supabase
        .from('conversation_participants')
        .select(`
          *,
          conversation:conversations(
            *
          )
        `)
        .eq('user_id', currentUserId)
        .order('last_read_at', { ascending: false })

      if (partError) throw partError

      const conversationsWithParticipants: ConversationWithDetails[] = []
      const participantIds: string[] = []

      for (const part of participations || []) {
        const conv = part.conversation
        if (!conv) continue

        // Get the other participant(s) in this conversation
        const { data: otherParticipants } = await supabase
          .from('conversation_participants')
          .select('user_id')
          .eq('conversation_id', conv.id)
          .neq('user_id', currentUserId)

        const otherUserId = otherParticipants?.[0]?.user_id

        if (otherUserId) {
          participantIds.push(otherUserId)
        }

        let participant: Profile | null = null
        if (otherUserId) {
          const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', otherUserId)
            .single()
          participant = data
        }

        // Get last message
        const { data: lastMessage } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        // Count unread messages
        const { count: unreadCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', conv.id)
          .neq('sender_id', currentUserId)
          .gt('created_at', part.last_read_at || '1970-01-01')

        if (participant) {
          conversationsWithParticipants.push({
            ...conv,
            participant,
            last_message: lastMessage,
            unread_count: unreadCount || 0,
            is_pinned: part.is_pinned,
            is_muted: part.is_muted,
          })
        }
      }

      // Sort: pinned first, then by last message time
      const sorted = conversationsWithParticipants.sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1
        if (!a.is_pinned && b.is_pinned) return 1
        const dateA = a.last_message?.created_at ? new Date(a.last_message.created_at).getTime() : 0
        const dateB = b.last_message?.created_at ? new Date(b.last_message.created_at).getTime() : 0
        return dateB - dateA
      })

      setConversations(sorted)

      // Save conversation IDs for filtering realtime updates (ref for immediate access in callbacks)
      const ids: string[] = []
      sorted.forEach(c => ids.push(c.id))
      conversationIdsRef.current = ids

      // Update participant statuses
      if (participantIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, status')
          .in('id', participantIds)

        if (profiles) {
          const newStatuses = new Map<string, 'online' | 'offline' | 'away' | 'busy'>()
          profiles.forEach(p => {
            newStatuses.set(p.id, (p.status as 'online' | 'offline' | 'away' | 'busy') || 'offline')
          })
          setParticipantStatuses(prev => {
            const next = new Map(prev)
            newStatuses.forEach((status, id) => next.set(id, status))
            return next
          })
        }
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err)
    } finally {
      setLoading(false)
    }
  }, [currentUserId, supabase])

  useEffect(() => {
    fetchConversations()

    // Subscribe to conversation participant changes (last_read_at updates)
    // Use unique channel name per user to avoid conflicts
    const channel = supabase
      .channel(`conversations-changes-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_participants',
          filter: `user_id=eq.${currentUserId}`,
        },
        (payload) => {
          const updated = payload.new as { conversation_id: string; last_read_at: string }
          // When last_read_at updates (user opened a conversation), reset unread count
          setConversations(prev => prev.map(conv => {
            if (conv.id === updated.conversation_id) {
              return { ...conv, unread_count: 0 }
            }
            return conv
          }))
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
        },
        async (payload) => {
          const updated = payload.new as { id: string; last_message_at: string }

          console.log('[ChatsList] Conversation updated:', updated.id)

          // Check if we know this conversation
          if (conversationIdsRef.current.includes(updated.id)) {
            // Fetch the new message and update
            try {
              const { data: lastMessage } = await supabase
                .from('messages')
                .select('*')
                .eq('conversation_id', updated.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .single()

              if (lastMessage && lastMessage.sender_id !== currentUserId) {
                // New message from someone else - increase unread
                setConversations(prev => prev.map(conv => {
                  if (conv.id === updated.id) {
                    return {
                      ...conv,
                      unread_count: conv.unread_count + 1,
                      last_message: lastMessage
                    }
                  }
                  return conv
                }))
              } else if (lastMessage) {
                // Message from self - just update last_message
                setConversations(prev => prev.map(conv => {
                  if (conv.id === updated.id) {
                    return { ...conv, last_message: lastMessage }
                  }
                  return conv
                }))
              }
            } catch (err) {
              console.error('[ChatsList] Error fetching last message:', err)
            }
          } else {
            // Unknown conversation - refetch
            console.log('[ChatsList] New conversation detected, refetching...')
            fetchConversations()
          }
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [currentUserId, supabase, fetchConversations])

  // Subscribe to profile status changes for all participants
  useEffect(() => {
    const participantIds = conversations.map(c => c.participant.id)
    if (participantIds.length === 0) return

    const channel = supabase
      .channel(`participant-statuses-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
        },
        (payload) => {
          const updated = payload.new as Profile
          if (participantIds.includes(updated.id)) {
            setParticipantStatuses(prev => {
              const next = new Map(prev)
              next.set(updated.id, updated.status as 'online' | 'offline' | 'away' | 'busy')
              return next
            })
          }
        }
      )
      .subscribe()

    statusChannelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      statusChannelRef.current = null
    }
  }, [currentUserId, supabase, conversations])

  const filteredConversations = conversations.filter((conv) => {
    // Search filter
    const matchesSearch = conv.participant.display_name.toLowerCase().includes(search.toLowerCase())

    // Tab filter
    let matchesTab = true
    if (activeTab === 'unread') {
      matchesTab = conv.unread_count > 0
    }

    return matchesSearch && matchesTab
  })

  // Sort: pinned first, then by last message time
  const sortedConversations = [...filteredConversations].sort((a, b) => {
    // Pinned conversations first
    if (a.is_pinned && !b.is_pinned) return -1
    if (!a.is_pinned && b.is_pinned) return 1

    // Then by last message time
    const dateA = a.last_message?.created_at ? new Date(a.last_message.created_at).getTime() : 0
    const dateB = b.last_message?.created_at ? new Date(b.last_message.created_at).getTime() : 0
    return dateB - dateA
  })

  const tabs: { key: TabType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: 'Unread' },
    { key: 'personal', label: 'Personal' },
  ]

  return (
    <div className="flex h-full w-80 flex-col border-r border-[var(--border-default)] bg-[var(--bg-panel)]">
      {/* Header */}
      <div className="p-4">
        <h1 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">Chats</h1>

        {/* Search */}
        <div className="relative">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            type="search"
            placeholder="Search or start new chat"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'text-primary-500 bg-[var(--bg-active)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Separator className="mt-4" />

      {/* Conversations list */}
      <ScrollArea className="flex-1">
        <div className="py-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
            </div>
          ) : sortedConversations.length > 0 ? (
            sortedConversations.map((conversation, index) => (
              <div key={conversation.id}>
                <ConversationItem
                  conversation={conversation}
                  isActive={selectedConversationId === conversation.id}
                  currentUserId={currentUserId}
                  participantStatus={participantStatuses.get(conversation.participant.id) || 'offline'}
                />
                {index < sortedConversations.length - 1 && <Separator />}
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
              <MessageSquare className="mb-3 h-12 w-12 opacity-50" />
              <p className="text-sm">No conversations found</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
