'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { Search, Pin, BellOff, MessageSquare, Archive, Tag, ChevronDown, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { NotificationPermission } from '@/components/notifications/notification-permission'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/client'
import { getBlockedUsers } from '@/lib/actions/block'
import { useDraftStore } from '@/stores/draft-store'
import { useConversationLabels } from '@/hooks/use-conversation-labels'
import { useSearch } from '@/hooks/use-search'
import { useChatsListStore, type ConversationWithDetails } from '@/stores/chats-list-store'
import type { Tables } from '@/types'

type Profile = Tables<'profiles'>
type Message = Tables<'messages'>

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
  labels?: Tables<'conversation_labels'>[]
  draft?: string
}

function ConversationItem({ conversation, isActive, currentUserId, participantStatus, labels = [], draft }: ConversationItemProps) {
  const isFromMe = conversation.last_message?.sender_id === currentUserId

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
      <div className="relative">
        <Avatar user={conversation.participant} size="lg" showStatus={false} />
        <span
          className={cn(
            'absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[var(--bg-panel)]',
            getStatusColor()
          )}
        />
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="truncate font-medium text-[var(--text-primary)]">
              {conversation.participant.display_name}
            </span>
            {conversation.is_pinned && (
              <Pin className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
            )}
            {conversation.is_muted && (
              <BellOff className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
            )}
            {labels.length > 0 && (
              <div className="flex gap-1">
                {labels.slice(0, 3).map((label) => (
                  <div
                    key={label.id}
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: label.color || '#8B5CF6' }}
                    title={label.name || ''}
                  />
                ))}
              </div>
            )}
          </div>
          <span className="shrink-0 text-xs text-[var(--text-muted)]">
            {formatMessageTime(conversation.last_message?.created_at || conversation.last_message_at)}
          </span>
        </div>

        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className={cn(
            'truncate text-sm',
            draft ? 'text-primary-500 italic' : 'text-[var(--text-secondary)]'
          )}>
            {draft ? (
              <span className="flex items-center gap-1">
                <span className="text-[var(--text-muted)]">Draft: </span>
                {draft}
              </span>
            ) : (
              <>
                {isFromMe && <span className="text-[var(--text-muted)]">You: </span>}
                {conversation.last_message?.content || 'No messages yet'}
              </>
            )}
          </p>

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
  currentUserId: string
}

type TabType = 'all' | 'unread' | 'archived'

// Refresh conversations list if cache is older than 30 seconds
const CACHE_STALE_MS = 30_000

export function ChatsList({ currentUserId }: ChatsListProps) {
  const pathname = usePathname()
  // Derive selected conversation from URL — works even when component never remounts
  const selectedConversationId = pathname.startsWith('/chats/')
    ? pathname.split('/chats/')[1]
    : null
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [hydrated, setHydrated] = useState(false)

  // Use store-backed state — persists across navigation, no remount flash
  const conversations = useChatsListStore((s) => s.conversations)
  const archivedConversations = useChatsListStore((s) => s.archivedConversations)
  const participantStatuses = useChatsListStore((s) => s.participantStatuses)
  const blockedUserIds = useChatsListStore((s) => s.blockedUserIds)
  const loading = useChatsListStore((s) => s.loading)
  const lastFetchedAt = useChatsListStore((s) => s.lastFetchedAt)
  const setAll = useChatsListStore((s) => s.setAll)
  const setLoading = useChatsListStore((s) => s.setLoading)
  const setBlockedUserIds = useChatsListStore((s) => s.setBlockedUserIds)
  const upsertConversation = useChatsListStore((s) => s.upsertConversation)
  const updateConversation = useChatsListStore((s) => s.updateConversation)
  const incrementUnread = useChatsListStore((s) => s.incrementUnread)
  const updateLastMessage = useChatsListStore((s) => s.updateLastMessage)
  const setParticipantStatus = useChatsListStore((s) => s.setParticipantStatus)
  const storeConversationIdsRef = useRef<string[]>([])
  const supabase = createClient()
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const statusChannelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)

  // Label filter
  const [labelFilterOpen, setLabelFilterOpen] = useState(false)
  const [selectedLabelIds, setSelectedLabelIds] = useState<Set<string>>(new Set())

  // Drafts
  const { drafts } = useDraftStore()

  // Conversation labels (userId comes from provider)
  const { labels, conversationLabels, loadLabelsForConversations } = useConversationLabels()

  // Global search — messages + contacts
  const { state: searchState, search: runMessageSearch, searchContacts, clearSearch } = useSearch()

  // Restore tab from localStorage after hydration to avoid mismatch
  useEffect(() => {
    try {
      const saved = localStorage.getItem('chats-list-tab')
      if (saved === 'all' || saved === 'unread' || saved === 'archived') {
        setActiveTab(saved)
      }
    } catch {}
    setHydrated(true)
  }, [])

  useEffect(() => {
    const query = search.trim()
    if (!query) {
      clearSearch()
      return
    }
    runMessageSearch(query)
    searchContacts(query)
  }, [search, runMessageSearch, searchContacts, clearSearch])

  const showSearchResults = search.trim().length > 0
  const hasMessageResults = searchState.results.length > 0
  const hasContactResults = searchState.contacts.length > 0

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab)
    try {
      localStorage.setItem('chats-list-tab', tab)
    } catch {}
  }

  const fetchBlockedUsers = useCallback(async () => {
    try {
      const blocked = await getBlockedUsers()
      setBlockedUserIds(new Set(blocked))
    } catch (err) {
      console.error('Failed to fetch blocked users:', err)
    }
  }, [setBlockedUserIds])

  const fetchConversations = useCallback(async () => {
    if (!currentUserId) {
      setLoading(false)
      return
    }

    setLoading(true)

    try {
      const { data: participations, error: partError } = await supabase
        .from('conversation_participants')
        .select(`*, conversation:conversations(*)`)
        .eq('user_id', currentUserId)
        .order('last_read_at', { ascending: false })

      if (partError) throw partError

      const conversationsWithParticipants: ConversationWithDetails[] = []
      const participantIds: string[] = []

      for (const part of participations || []) {
        const conv = part.conversation
        if (!conv) continue

        const { data: otherParticipants } = await supabase
          .from('conversation_participants')
          .select('user_id')
          .eq('conversation_id', conv.id)
          .neq('user_id', currentUserId)

        const otherUserId = otherParticipants?.[0]?.user_id
        if (otherUserId) participantIds.push(otherUserId)

        let participant: Profile | null = null
        if (otherUserId) {
          const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', otherUserId)
            .single()
          participant = data
        }

        const { data: lastMessage } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

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
            is_archived: part.is_archived,
          })
        }
      }

      const active: ConversationWithDetails[] = []
      const archived: ConversationWithDetails[] = []
      for (const conv of conversationsWithParticipants) {
        if (conv.is_archived) archived.push(conv)
        else active.push(conv)
      }

      const sortFn = (a: ConversationWithDetails, b: ConversationWithDetails) => {
        if (a.is_pinned && !b.is_pinned) return -1
        if (!a.is_pinned && b.is_pinned) return 1
        const dateA = a.last_message?.created_at ? new Date(a.last_message.created_at).getTime() : 0
        const dateB = b.last_message?.created_at ? new Date(b.last_message.created_at).getTime() : 0
        return dateB - dateA
      }

      active.sort(sortFn)
      archived.sort(sortFn)

      const ids: string[] = []
      active.forEach((c) => ids.push(c.id))
      archived.forEach((c) => ids.push(c.id))
      storeConversationIdsRef.current = ids

      loadLabelsForConversations(ids)

      let newStatuses = new Map<string, 'online' | 'offline' | 'away' | 'busy'>()
      if (participantIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, status')
          .in('id', participantIds)

        if (profiles) {
          profiles.forEach((p) => {
            newStatuses.set(p.id, (p.status as 'online' | 'offline' | 'away' | 'busy') || 'offline')
          })
        }
      }

      setAll({
        conversations: active,
        archivedConversations: archived,
        participantStatuses: newStatuses,
        blockedUserIds,
      })
    } catch (err) {
      console.error('Failed to fetch conversations:', err)
    } finally {
      setLoading(false)
    }
  }, [currentUserId, supabase, setAll, setLoading, blockedUserIds, loadLabelsForConversations])

  // Fetch conversations — but only if cache is stale or empty
  useEffect(() => {
    if (!currentUserId) return

    const isStale = Date.now() - lastFetchedAt > CACHE_STALE_MS
    const isEmpty = conversations.length === 0 && archivedConversations.length === 0

    if (isStale || isEmpty) {
      fetchConversations()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId])

  // Fetch blocked users once (independent of conversations cache)
  useEffect(() => {
    fetchBlockedUsers()
  }, [fetchBlockedUsers])

  useEffect(() => {
    if (!currentUserId) return

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
          const updated = payload.new as {
            conversation_id: string
            last_read_at: string
            is_pinned: boolean | null
            is_muted: boolean | null
            is_archived: boolean | null
          }

          updateConversation(updated.conversation_id, {
            is_pinned: updated.is_pinned ?? undefined,
            is_muted: updated.is_muted ?? undefined,
            is_archived: updated.is_archived ?? undefined,
            unread_count:
              updated.last_read_at && updated.last_read_at !== updated.conversation_id
                ? 0
                : undefined,
          })
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

          if (storeConversationIdsRef.current.includes(updated.id)) {
            try {
              const { data: lastMessage } = await supabase
                .from('messages')
                .select('*')
                .eq('conversation_id', updated.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .single()

              if (lastMessage) {
                incrementUnread(updated.id, lastMessage, lastMessage.sender_id !== currentUserId)
              }
            } catch (err) {
              console.error('[ChatsList] Error fetching last message:', err)
            }
          } else {
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
  }, [currentUserId, supabase, updateConversation, incrementUnread, fetchConversations])

  // Subscribe to profile status changes for all participants
  useEffect(() => {
    const participantIds = conversations.map((c) => c.participant.id)
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
            setParticipantStatus(
              updated.id,
              updated.status as 'online' | 'offline' | 'away' | 'busy'
            )
          }
        }
      )
      .subscribe()

    statusChannelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      statusChannelRef.current = null
    }
  }, [currentUserId, supabase, conversations, setParticipantStatus])

  const filteredConversations = conversations.filter((conv) => {
    if (blockedUserIds.has(conv.participant.id)) return false
    const matchesSearch = conv.participant.display_name.toLowerCase().includes(search.toLowerCase())
    let matchesTab = true
    if (activeTab === 'unread') {
      matchesTab = conv.unread_count > 0
    } else if (activeTab === 'all') {
      matchesTab = !conv.is_archived
    }
    let matchesLabels = true
    if (selectedLabelIds.size > 0) {
      const convLabels = conversationLabels.get(conv.id) || []
      const convLabelIds = new Set(convLabels.map((l) => l.id))
      matchesLabels = Array.from(selectedLabelIds).some((id) => convLabelIds.has(id))
    }
    return matchesSearch && matchesTab && matchesLabels
  })

  const filteredArchived = archivedConversations.filter((conv) =>
    conv.participant.display_name.toLowerCase().includes(search.toLowerCase())
  )

  const sortedConversations = [...filteredConversations].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1
    if (!a.is_pinned && b.is_pinned) return 1
    const dateA = a.last_message?.created_at ? new Date(a.last_message.created_at).getTime() : 0
    const dateB = b.last_message?.created_at ? new Date(b.last_message.created_at).getTime() : 0
    return dateB - dateA
  })

  const tabs: { key: TabType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: 'Unread' },
    { key: 'archived', label: 'Archived' },
  ]

  const startConversationWithContact = useCallback(
    async (contactId: string) => {
      if (!currentUserId) return

      try {
        const { data: existingConvs } = await supabase
          .from('conversation_participants')
          .select('conversation_id')
          .eq('user_id', currentUserId)

        let conversationId: string | null = null

        for (const part of existingConvs || []) {
          const { data: otherParts } = await supabase
            .from('conversation_participants')
            .select('user_id')
            .eq('conversation_id', part.conversation_id)
            .eq('user_id', contactId)

          if (otherParts && otherParts.length > 0) {
            conversationId = part.conversation_id
            break
          }
        }

        if (!conversationId) {
          const { data: newConv, error: createError } = await supabase
            .from('conversations')
            .insert({ created_by: currentUserId, type: 'direct' })
            .select()
            .single()

          if (createError || !newConv) {
            throw new Error(createError?.message || 'Failed to create conversation')
          }

          conversationId = newConv.id

          const { error: addSelfError } = await supabase
            .from('conversation_participants')
            .insert({ conversation_id: conversationId, user_id: currentUserId })

          if (addSelfError) throw new Error(addSelfError.message)

          const { error: addOtherError } = await supabase.rpc('add_conversation_participant', {
            p_conversation_id: conversationId,
            p_user_id: contactId,
          })

          if (addOtherError) throw new Error(addOtherError.message)
        }

        setSearch('')
        clearSearch()
        router.push(`/chats/${conversationId}`)
      } catch (err) {
        console.error('Failed to start conversation from search:', err)
      }
    },
    [currentUserId, supabase, router, clearSearch]
  )

  const openMessageInConversation = useCallback(
    (conversationId: string, messageId: string) => {
      setSearch('')
      clearSearch()
      router.push(`/chats/${conversationId}?scrollTo=${messageId}`)
    },
    [router, clearSearch]
  )

  return (
    <div className="flex h-full w-full flex-col border-r border-[var(--border-default)] bg-[var(--bg-panel)] md:w-80">
      <div className="p-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Chats</h1>
          {labels.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLabelFilterOpen(!labelFilterOpen)}
              className={cn('gap-1.5', selectedLabelIds.size > 0 && 'bg-primary-500/20 text-primary-500')}
            >
              <Tag className="h-4 w-4" />
              {selectedLabelIds.size > 0 && (
                <span className="ml-1 rounded bg-primary-500 px-1.5 py-0.5 text-xs text-white">
                  {selectedLabelIds.size}
                </span>
              )}
              <ChevronDown className="h-3 w-3" />
            </Button>
          )}
        </div>

        {labelFilterOpen && labels.length > 0 && (
          <div className="mb-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] p-2">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--text-secondary)]">Filter by label</span>
              {selectedLabelIds.size > 0 && (
                <button
                  onClick={() => setSelectedLabelIds(new Set())}
                  className="text-xs text-primary-500 hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {labels.map((label) => (
                <button
                  key={label.id}
                  onClick={() => {
                    const newSelected = new Set(selectedLabelIds)
                    if (newSelected.has(label.id)) newSelected.delete(label.id)
                    else newSelected.add(label.id)
                    setSelectedLabelIds(newSelected)
                  }}
                  className={cn(
                    'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition-colors',
                    selectedLabelIds.has(label.id)
                      ? 'bg-[var(--bg-active)] ring-1 ring-primary-500'
                      : 'bg-[var(--bg-hover)] hover:bg-[var(--bg-active)]'
                  )}
                >
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: label.color || '#8B5CF6' }} />
                  <span>{label.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

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

      <div className="flex gap-1 px-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
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

      <NotificationPermission />

      <ScrollArea className="flex-1">
        <div className="py-2">
          {loading && conversations.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
            </div>
          ) : showSearchResults ? (
            <div className="px-1">
              {searchState.loading && !hasMessageResults && !hasContactResults ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
                </div>
              ) : (
                <>
                  {hasContactResults && (
                    <>
                      <p className="px-3 py-2 text-xs font-medium text-[var(--text-muted)]">Contacts</p>
                      {searchState.contacts.map((contact) => (
                        <button
                          key={contact.id}
                          onClick={() => startConversationWithContact(contact.id)}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
                        >
                          <Avatar user={contact} size="md" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-[var(--text-primary)]">
                              {contact.display_name}
                            </p>
                            {contact.username && (
                              <p className="truncate text-xs text-[var(--text-muted)]">@{contact.username}</p>
                            )}
                          </div>
                          <User className="h-4 w-4 text-[var(--text-muted)]" />
                        </button>
                      ))}
                      <Separator className="my-2" />
                    </>
                  )}

                  {hasMessageResults && (
                    <>
                      <p className="px-3 py-2 text-xs font-medium text-[var(--text-muted)]">
                        Messages ({searchState.total})
                      </p>
                      {searchState.results.map((result) => {
                        if (!result.conversation_id) return null
                        return (
                          <button
                            key={result.id}
                            onClick={() => openMessageInConversation(result.conversation_id!, result.id)}
                            className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
                          >
                            <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--bg-secondary)]">
                              <MessageSquare className="h-4 w-4 text-primary-500" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium text-[var(--text-secondary)]">
                                {result.conversation_title || 'Conversation'}
                              </p>
                              <p className="mt-0.5 line-clamp-2 text-sm text-[var(--text-primary)]">
                                {result.content}
                              </p>
                            </div>
                          </button>
                        )
                      })}
                    </>
                  )}

                  {!hasContactResults && !hasMessageResults && (
                    <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
                      <Search className="mb-3 h-12 w-12 opacity-50" />
                      <p className="text-sm">No results for "{search}"</p>
                      <p className="mt-1 text-xs">Try different keywords</p>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : activeTab === 'archived' ? (
            filteredArchived.length > 0 ? (
              <>
                <div className="px-3 py-2">
                  <p className="text-xs text-[var(--text-muted)]">
                    {filteredArchived.length} archived {filteredArchived.length === 1 ? 'conversation' : 'conversations'}
                  </p>
                </div>
                {filteredArchived.map((conversation, index) => (
                  <div key={conversation.id}>
                    <ConversationItem
                      conversation={conversation}
                      isActive={selectedConversationId === conversation.id}
                      currentUserId={currentUserId}
                      participantStatus={participantStatuses.get(conversation.participant.id) || 'offline'}
                      labels={conversationLabels.get(conversation.id) || []}
                      draft={drafts.get(conversation.id)}
                    />
                    {index < filteredArchived.length - 1 && <Separator />}
                  </div>
                ))}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
                <Archive className="mb-3 h-12 w-12 opacity-50" />
                <p className="text-sm">No archived conversations</p>
              </div>
            )
          ) : sortedConversations.length > 0 ? (
            sortedConversations.map((conversation, index) => (
              <div key={conversation.id}>
                <ConversationItem
                  conversation={conversation}
                  isActive={selectedConversationId === conversation.id}
                  currentUserId={currentUserId}
                  participantStatus={participantStatuses.get(conversation.participant.id) || 'offline'}
                  labels={conversationLabels.get(conversation.id) || []}
                  draft={drafts.get(conversation.id)}
                />
                {index < sortedConversations.length - 1 && <Separator />}
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
              <MessageSquare className="mb-3 h-12 w-12 opacity-50" />
              <p className="text-sm">
                {activeTab === 'unread' ? 'No unread conversations' : 'No conversations found'}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}