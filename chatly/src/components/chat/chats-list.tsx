'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { Search, Pin, BellOff, MessageSquare, Archive, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { GroupAvatar } from '@/components/ui/group-avatar'
import { resolvePresence, type PresenceStatus } from '@/lib/presence'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { NotificationPermission } from '@/components/notifications/notification-permission'
import { Separator } from '@/components/ui/separator'
import { VerifiedBadge } from '@/components/ui/verified-badge'
import { createClient } from '@/lib/supabase/client'
import { getBlockedUsers } from '@/lib/actions/block'
import { useDraftStore } from '@/stores/draft-store'
import { useSearch } from '@/hooks/use-search'
import { useChatsListStore, type ConversationWithDetails } from '@/stores/chats-list-store'
import type { PublicProfile } from '@/types'
import { useI18n } from '@/lib/i18n'
import {
  isMissingConversationPageRpc,
  paginateConversationSummaries,
  parseConversationSummaries,
  parseConversationSummaryPage,
  type ConversationSummary,
  type ConversationSummaryPage,
} from '@/lib/conversation-summary'
import { createConversation } from '@/lib/actions/conversations'
import { getSearchSnippet } from '@/lib/search-text'
import { useChatCacheStore } from '@/stores/chat-cache-store'
import { retryStorageCleanup } from '@/lib/actions/storage'
import { AssistantEntry } from './assistant-entry'

type Profile = PublicProfile

function formatMessageTime(dateStr: string | null, dateLocale: string, yesterday: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return date.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })
  } else if (diffDays === 1) {
    return yesterday
  } else if (diffDays < 7) {
    return date.toLocaleDateString(dateLocale, { weekday: 'short' })
  }
  return date.toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })
}

interface ConversationItemProps {
  conversation: ConversationWithDetails
  isActive: boolean
  currentUserId: string
  participantStatus: PresenceStatus
  draft?: string
}

function ConversationItem({
  conversation,
  isActive,
  currentUserId,
  participantStatus,
  draft,
}: ConversationItemProps) {
  const { t, dateLocale } = useI18n()
  const isFromMe = conversation.last_message?.sender_id === currentUserId
  const isGroup = conversation.type === 'group'
  const displayName =
    isGroup || conversation.type === 'ai'
      ? (conversation.type === 'ai' ? conversation.ai_agent_name : conversation.title) ||
        conversation.title ||
        t('group.tab')
      : conversation.participant?.display_name || t('common.user')
  const avatarUser =
    isGroup || conversation.type === 'ai'
      ? { id: conversation.id, display_name: displayName, avatar_url: conversation.avatar_url }
      : conversation.participant

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
        'list-render-row flex items-center gap-3 px-3 py-3 transition-colors',
        isActive ? 'bg-[var(--bg-active)]' : 'hover:bg-[var(--bg-hover)]',
        conversation.unread_count > 0 && !isActive && 'bg-[var(--bg-hover)]'
      )}
      aria-current={isActive ? 'page' : undefined}
    >
      <div className="relative">
        {isGroup ? (
          <GroupAvatar
            id={conversation.id}
            name={displayName}
            avatarUrl={conversation.avatar_url}
            members={conversation.group_members}
            size="lg"
          />
        ) : (
          <Avatar user={avatarUser!} size="lg" showStatus={false} />
        )}
        {isGroup ? (
          <span className="bg-primary-500 absolute right-0 bottom-0 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[var(--bg-panel)] px-1 text-[10px] font-semibold text-white">
            {conversation.member_count}
          </span>
        ) : (
          <span
            className={cn(
              'absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-[var(--bg-panel)]',
              getStatusColor()
            )}
          />
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="truncate font-medium text-[var(--text-primary)]">{displayName}</span>
            {!isGroup && conversation.participant?.is_verified && (
              <VerifiedBadge label={t('verified.label')} />
            )}
            {conversation.is_pinned && (
              <Pin className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
            )}
            {conversation.is_muted && (
              <BellOff className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
            )}
          </div>
          <span className="shrink-0 text-xs text-[var(--text-muted)]">
            {formatMessageTime(
              conversation.last_message?.created_at || conversation.last_message_at,
              dateLocale,
              t('chatList.yesterday')
            )}
          </span>
        </div>

        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p
            className={cn(
              'truncate text-sm',
              draft ? 'text-primary-500 italic' : 'text-[var(--text-secondary)]'
            )}
          >
            {draft ? (
              <span className="flex items-center gap-1">
                <span className="text-[var(--text-muted)]">{t('chatList.draft')}: </span>
                {draft}
              </span>
            ) : (
              <>
                {isFromMe && <span className="text-[var(--text-muted)]">{t('common.you')}: </span>}
                {conversation.last_message?.content || t('chatList.noMessages')}
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

type TabType = 'all' | 'unread' | 'groups' | 'archived'

// Refresh conversations list if cache is older than 30 seconds
const CACHE_STALE_MS = 30_000
const CONVERSATION_PAGE_SIZE = 80
const REALTIME_FILTER_MAX_IDS = 100
const MAX_LIVE_PRESENCE_CONVERSATIONS = 200
const EMPTY_CONVERSATIONS: ConversationWithDetails[] = []

function sortConversationPage(conversations: ConversationWithDetails[]) {
  return [...conversations].sort((left, right) => {
    if (left.is_pinned !== right.is_pinned) return left.is_pinned ? -1 : 1
    const leftDate =
      [left.last_message?.created_at, left.last_message_at]
        .filter((date): date is string => Boolean(date))
        .sort()
        .at(-1) ?? ''
    const rightDate =
      [right.last_message?.created_at, right.last_message_at]
        .filter((date): date is string => Boolean(date))
        .sort()
        .at(-1) ?? ''
    return rightDate.localeCompare(leftDate) || right.id.localeCompare(left.id)
  })
}

export function ChatsList({ currentUserId }: ChatsListProps) {
  const { t } = useI18n()
  const pathname = usePathname()
  // Derive selected conversation from URL — works even when component never remounts
  const selectedConversationId = pathname.startsWith('/chats/')
    ? pathname.split('/chats/')[1]
    : null
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [hasMoreConversations, setHasMoreConversations] = useState(false)
  const [conversationTotalCount, setConversationTotalCount] = useState(0)
  const [loadingMoreConversations, setLoadingMoreConversations] = useState(false)
  const [conversationLoadFailed, setConversationLoadFailed] = useState(false)
  // Use store-backed state — persists across navigation, no remount flash
  const ownerUserId = useChatsListStore((s) => s.ownerUserId)
  const storedConversations = useChatsListStore((s) => s.conversations)
  const storedArchivedConversations = useChatsListStore((s) => s.archivedConversations)
  const participantStatuses = useChatsListStore((s) => s.participantStatuses)
  const storedLoading = useChatsListStore((s) => s.loading)
  const lastFetchedAt = useChatsListStore((s) => s.lastFetchedAt)
  const beginUserSession = useChatsListStore((s) => s.beginUserSession)
  const setAll = useChatsListStore((s) => s.setAll)
  const setLoading = useChatsListStore((s) => s.setLoading)
  const setBlockedUserIds = useChatsListStore((s) => s.setBlockedUserIds)
  const updateConversation = useChatsListStore((s) => s.updateConversation)
  const incrementUnread = useChatsListStore((s) => s.incrementUnread)
  const setParticipantStatus = useChatsListStore((s) => s.setParticipantStatus)
  const storeConversationIdsRef = useRef<Set<string>>(new Set())
  const legacySummaryCacheRef = useRef<{
    userId: string
    fetchedAt: number
    conversations: ConversationSummary[]
  } | null>(null)
  const conversationOffsetRef = useRef(0)
  const listRequestVersionRef = useRef(0)
  const fetchedTabRef = useRef<TabType | null>(null)
  const activeTabRef = useRef(activeTab)
  const [supabase] = useState(() => createClient())
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const statusChannelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(
    null
  )

  // Drafts
  const { drafts } = useDraftStore()

  // Global search — messages + contacts
  const {
    state: searchState,
    search: runMessageSearch,
    searchContacts,
    clearSearch,
    loadMore: loadMoreSearch,
    hasMore: hasMoreSearch,
  } = useSearch()

  const hasCurrentUserScope = ownerUserId === currentUserId
  const conversations = hasCurrentUserScope ? storedConversations : EMPTY_CONVERSATIONS
  const archivedConversations = hasCurrentUserScope
    ? storedArchivedConversations
    : EMPTY_CONVERSATIONS
  const loading = !hasCurrentUserScope || storedLoading

  useLayoutEffect(() => {
    beginUserSession(currentUserId)
    storeConversationIdsRef.current = new Set()
  }, [beginUserSession, currentUserId])

  useLayoutEffect(() => {
    activeTabRef.current = activeTab
  }, [activeTab])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setSearch('')
      clearSearch()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [clearSearch, currentUserId])

  // Restore tab from localStorage after hydration to avoid mismatch
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const saved = localStorage.getItem('chats-list-tab')
        if (saved === 'all' || saved === 'unread' || saved === 'groups' || saved === 'archived') {
          setActiveTab(saved)
        }
      } catch {}
    }, 0)
    return () => window.clearTimeout(timeoutId)
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
    activeTabRef.current = tab
    setActiveTab(tab)
    conversationOffsetRef.current = 0
    fetchedTabRef.current = null
    setHasMoreConversations(false)
    setConversationTotalCount(0)
    try {
      localStorage.setItem('chats-list-tab', tab)
    } catch {}
  }

  const loadConversationPage = useCallback(
    async (tab: TabType, offset: number) => {
      const { data, error } = await supabase.rpc('get_conversation_summaries_page', {
        p_limit: CONVERSATION_PAGE_SIZE,
        p_offset: offset,
        p_tab: tab,
        p_query: '',
      })

      let page: ConversationSummaryPage
      if (error) {
        if (!isMissingConversationPageRpc(error)) {
          console.warn('Paginated conversation RPC failed; trying the compatibility RPC:', error)
        }
        let legacyConversations = legacySummaryCacheRef.current?.conversations
        const cacheIsCurrent =
          legacySummaryCacheRef.current?.userId === currentUserId &&
          Date.now() - legacySummaryCacheRef.current.fetchedAt < CACHE_STALE_MS

        if (!cacheIsCurrent || !legacyConversations) {
          const legacyResult = await supabase.rpc('get_conversation_summaries')
          if (legacyResult.error) throw legacyResult.error
          legacyConversations = parseConversationSummaries(legacyResult.data)
          legacySummaryCacheRef.current = {
            userId: currentUserId,
            fetchedAt: Date.now(),
            conversations: legacyConversations,
          }
        }

        page = paginateConversationSummaries(legacyConversations, {
          offset,
          limit: CONVERSATION_PAGE_SIZE,
          tab,
        })
      } else {
        page = parseConversationSummaryPage(data)
      }

      const groupIds = page.items
        .filter((conversation) => conversation.type === 'group')
        .map((conversation) => conversation.id)

      if (groupIds.length === 0) return page

      const { data: groupMemberRows } = await supabase.rpc('get_group_avatar_members', {
        p_conversation_ids: groupIds,
      })
      if (!groupMemberRows) return page

      const membersByConversation = new Map<string, PublicProfile[]>()
      groupMemberRows.forEach(({ conversation_id, ...profile }) => {
        const members = membersByConversation.get(conversation_id) ?? []
        members.push(profile)
        membersByConversation.set(conversation_id, members)
      })

      return {
        ...page,
        items: page.items.map((conversation) => ({
          ...conversation,
          group_members: membersByConversation.get(conversation.id) ?? [],
        })),
      }
    },
    [currentUserId, supabase]
  )

  const fetchConversations = useCallback(async () => {
    if (!currentUserId) {
      setLoading(currentUserId, false)
      return
    }

    const requestVersion = ++listRequestVersionRef.current
    const tab = activeTabRef.current
    setConversationLoadFailed(false)
    setLoading(currentUserId, true)

    try {
      const [blocked, page] = await Promise.all([getBlockedUsers(), loadConversationPage(tab, 0)])
      if (requestVersion !== listRequestVersionRef.current || tab !== activeTabRef.current) return
      setBlockedUserIds(currentUserId, new Set(blocked))

      const active = tab === 'archived' ? [] : page.items
      const archived = tab === 'archived' ? page.items : []

      storeConversationIdsRef.current = new Set([
        ...active.map((conversation) => conversation.id),
        ...archived.map((conversation) => conversation.id),
      ])

      const newStatuses = new Map<
        string,
        { status: 'online' | 'offline' | 'away' | 'busy'; lastSeen: string | null }
      >()
      for (const conversation of page.items) {
        const participant = conversation.participant
        if (conversation.type !== 'direct' || !participant) continue
        newStatuses.set(participant.id, {
          status: participant.status ?? 'offline',
          lastSeen: participant.last_seen ?? null,
        })
      }

      setAll(currentUserId, {
        conversations: active,
        archivedConversations: archived,
        participantStatuses: newStatuses,
      })
      conversationOffsetRef.current = page.items.length
      fetchedTabRef.current = tab
      setHasMoreConversations(page.hasMore)
      setConversationTotalCount(page.totalCount)
    } catch (err) {
      if (requestVersion === listRequestVersionRef.current) {
        console.warn('Failed to fetch conversations:', err)
        setConversationLoadFailed(true)
      }
    } finally {
      if (requestVersion === listRequestVersionRef.current) setLoading(currentUserId, false)
    }
  }, [currentUserId, loadConversationPage, setAll, setBlockedUserIds, setLoading])

  const loadMoreConversations = useCallback(async () => {
    if (!currentUserId || !hasMoreConversations || loadingMoreConversations) return

    const requestVersion = listRequestVersionRef.current
    const tab = activeTabRef.current
    setLoadingMoreConversations(true)

    try {
      const page = await loadConversationPage(tab, conversationOffsetRef.current)
      if (requestVersion !== listRequestVersionRef.current || tab !== activeTabRef.current) return

      const store = useChatsListStore.getState()
      const currentItems = tab === 'archived' ? store.archivedConversations : store.conversations
      const mergedItems = [...currentItems]
      const itemIndex = new Map(mergedItems.map((conversation, index) => [conversation.id, index]))
      for (const conversation of page.items) {
        const index = itemIndex.get(conversation.id)
        if (index === undefined) {
          itemIndex.set(conversation.id, mergedItems.length)
          mergedItems.push(conversation)
        } else {
          mergedItems[index] = conversation
        }
      }

      const participantStatuses = new Map(store.participantStatuses)
      for (const conversation of page.items) {
        if (conversation.type !== 'direct' || !conversation.participant) continue
        participantStatuses.set(conversation.participant.id, {
          status: conversation.participant.status ?? 'offline',
          lastSeen: conversation.participant.last_seen ?? null,
        })
      }

      const active = tab === 'archived' ? [] : mergedItems
      const archived = tab === 'archived' ? mergedItems : []
      setAll(currentUserId, {
        conversations: active,
        archivedConversations: archived,
        participantStatuses,
      })
      storeConversationIdsRef.current = new Set(mergedItems.map((conversation) => conversation.id))
      conversationOffsetRef.current += page.items.length
      setHasMoreConversations(page.hasMore)
      setConversationTotalCount(page.totalCount)
    } catch (err) {
      console.error('Failed to load more conversations:', err)
    } finally {
      setLoadingMoreConversations(false)
    }
  }, [currentUserId, hasMoreConversations, loadConversationPage, loadingMoreConversations, setAll])

  // Fetch conversations — but only if cache is stale or empty
  useEffect(() => {
    if (currentUserId) void retryStorageCleanup().catch(() => undefined)
  }, [currentUserId])

  useEffect(() => {
    if (!currentUserId) return

    const isStale = Date.now() - lastFetchedAt > CACHE_STALE_MS
    if (!hasCurrentUserScope || isStale || fetchedTabRef.current !== activeTab) {
      void fetchConversations()
    }
  }, [activeTab, currentUserId, fetchConversations, hasCurrentUserScope, lastFetchedAt])

  useEffect(() => {
    if (!currentUserId) return

    const channel = supabase
      .channel(`conversations-changes-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_participants',
          filter: `user_id=eq.${currentUserId}`,
        },
        (payload) => {
          if (payload.eventType !== 'UPDATE') {
            void fetchConversations()
            return
          }
          const updated = payload.new as {
            conversation_id: string
            hidden_at: string | null
            last_read_at: string
            is_pinned: boolean | null
            is_muted: boolean | null
            is_archived: boolean | null
          }

          if (updated.hidden_at) {
            useChatCacheStore.getState().clearCache(updated.conversation_id)
            useChatsListStore.getState().removeConversation(updated.conversation_id)
            return
          }
          if (!storeConversationIdsRef.current.has(updated.conversation_id)) {
            void fetchConversations()
            return
          }

          updateConversation(updated.conversation_id, {
            is_pinned: updated.is_pinned ?? undefined,
            is_muted: updated.is_muted ?? undefined,
            is_archived: updated.is_archived ?? undefined,
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
          const updated = payload.new as {
            id: string
            last_message_at: string | null
            title: string | null
            avatar_url: string | null
            updated_at: string | null
          }

          if (storeConversationIdsRef.current.has(updated.id)) {
            const store = useChatsListStore.getState()
            const existing = [...store.conversations, ...store.archivedConversations].find(
              (conversation) => conversation.id === updated.id
            )
            if (
              existing?.last_message_at &&
              (!updated.last_message_at || updated.last_message_at < existing.last_message_at)
            ) {
              void fetchConversations()
              return
            }
            const hasNewMessage = Boolean(
              updated.last_message_at && updated.last_message_at !== existing?.last_message_at
            )
            updateConversation(updated.id, {
              title: updated.title,
              avatar_url: updated.avatar_url,
              updated_at: updated.updated_at,
              last_message_at: updated.last_message_at,
            })
            if (!hasNewMessage) return

            try {
              const { data: lastMessage } = await supabase
                .from('messages')
                .select('*')
                .eq('conversation_id', updated.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .single()

              if (lastMessage) {
                incrementUnread(
                  updated.id,
                  lastMessage,
                  lastMessage.sender_id !== currentUserId && updated.id !== selectedConversationId
                )
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
  }, [
    currentUserId,
    supabase,
    updateConversation,
    incrementUnread,
    fetchConversations,
    selectedConversationId,
  ])

  const filteredArchived = useMemo(
    () => sortConversationPage(archivedConversations),
    [archivedConversations]
  )
  const sortedConversations = useMemo(() => sortConversationPage(conversations), [conversations])

  const participantKey = useMemo(() => {
    if (showSearchResults) return ''

    const visibleConversations = (
      activeTab === 'archived' ? filteredArchived : sortedConversations
    ).slice(0, MAX_LIVE_PRESENCE_CONVERSATIONS)

    return [
      ...new Set(
        visibleConversations.flatMap((conversation) =>
          conversation.type === 'direct' && conversation.participant
            ? [conversation.participant.id]
            : []
        )
      ),
    ]
      .sort()
      .join(',')
  }, [activeTab, filteredArchived, showSearchResults, sortedConversations])

  // Subscribe only to direct-chat profiles currently shown in the active list.
  useEffect(() => {
    const participantIds = participantKey ? participantKey.split(',') : []
    if (participantIds.length === 0) return

    let channel = supabase.channel(`participant-statuses-${currentUserId}`)
    for (let offset = 0; offset < participantIds.length; offset += REALTIME_FILTER_MAX_IDS) {
      const ids = participantIds.slice(offset, offset + REALTIME_FILTER_MAX_IDS)
      channel = channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=in.(${ids.join(',')})`,
        },
        (payload) => {
          const updated = payload.new as Profile
          setParticipantStatus(
            updated.id,
            updated.status as 'online' | 'offline' | 'away' | 'busy',
            updated.last_seen ?? null
          )
        }
      )
    }
    channel.subscribe()

    statusChannelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      statusChannelRef.current = null
    }
  }, [currentUserId, supabase, participantKey, setParticipantStatus])

  const tabs: { key: TabType; label: string }[] = [
    { key: 'all', label: t('chatList.all') },
    { key: 'unread', label: t('chatList.unread') },
    { key: 'groups', label: t('group.tab') },
    { key: 'archived', label: t('chatList.archived') },
  ]

  const startConversationWithContact = useCallback(
    async (contactId: string) => {
      if (!currentUserId) return

      try {
        const conversation = await createConversation(contactId)

        setSearch('')
        clearSearch()
        router.push(`/chats/${conversation.id}`)
      } catch (err) {
        console.error('Failed to start conversation from search:', err)
      }
    },
    [currentUserId, router, clearSearch]
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
        <div className="mb-4">
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            {t('chatList.title')}
          </h1>
        </div>

        <div className="relative">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            type="search"
            placeholder={t('chatList.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="scrollbar-thin flex shrink-0 gap-1 overflow-x-auto px-4 pb-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={cn(
              'shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
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
      <AssistantEntry />

      <ScrollArea className="flex-1">
        <div className="py-2">
          {loading &&
          (activeTab === 'archived' ? archivedConversations : conversations).length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="border-primary-500 h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
            </div>
          ) : showSearchResults ? (
            <div className="px-1">
              {searchState.loading && !hasMessageResults && !hasContactResults ? (
                <div className="flex items-center justify-center py-12">
                  <div className="border-primary-500 h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
                </div>
              ) : (
                <>
                  {hasContactResults && (
                    <>
                      <p className="px-3 py-2 text-xs font-medium text-[var(--text-muted)]">
                        {t('chatList.contacts')}
                      </p>
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
                              <p className="truncate text-xs text-[var(--text-muted)]">
                                @{contact.username}
                              </p>
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
                        {t('chatList.messages')} ({searchState.total}
                        {hasMoreSearch ? '+' : ''})
                      </p>
                      {searchState.results.map((result) => {
                        if (!result.conversation_id) return null
                        return (
                          <button
                            key={result.id}
                            onClick={() =>
                              openMessageInConversation(result.conversation_id!, result.id)
                            }
                            className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
                          >
                            <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--bg-secondary)]">
                              <MessageSquare className="text-primary-500 h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium text-[var(--text-secondary)]">
                                {result.conversation_title || t('chat.selectConversation')}
                              </p>
                              <p className="mt-0.5 line-clamp-2 text-sm text-[var(--text-primary)]">
                                {getSearchSnippet(result.content, search)}
                              </p>
                            </div>
                          </button>
                        )
                      })}
                    </>
                  )}

                  {hasMoreSearch && (
                    <Button
                      variant="ghost"
                      className="w-full"
                      disabled={searchState.loading}
                      onClick={() => void loadMoreSearch()}
                    >
                      {t('search.loadMore')}
                    </Button>
                  )}
                  {searchState.error && (
                    <p role="alert" className="p-3 text-sm">
                      {searchState.error}
                    </p>
                  )}
                  {!hasContactResults && !hasMessageResults && !searchState.error && (
                    <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
                      <Search className="mb-3 h-12 w-12 opacity-50" />
                      <p className="text-sm">{t('chatList.noResults', { query: search })}</p>
                      <p className="mt-1 text-xs">{t('chatList.tryDifferent')}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : conversationLoadFailed &&
            (activeTab === 'archived' ? archivedConversations : conversations).length === 0 ? (
            <div role="alert" className="flex flex-col items-center gap-3 px-4 py-12 text-center">
              <p className="text-sm text-[var(--text-secondary)]">{t('chatList.loadFailed')}</p>
              <Button variant="outline" size="sm" onClick={() => void fetchConversations()}>
                {t('chatList.retry')}
              </Button>
            </div>
          ) : activeTab === 'archived' ? (
            filteredArchived.length > 0 ? (
              <>
                <div className="px-3 py-2">
                  <p className="text-xs text-[var(--text-muted)]">
                    {t('chatList.archivedCount', { count: conversationTotalCount })}
                  </p>
                </div>
                {filteredArchived.map((conversation, index) => {
                  const ps = conversation.participant
                    ? participantStatuses.get(conversation.participant.id)
                    : undefined
                  return (
                    <div key={conversation.id}>
                      <ConversationItem
                        conversation={conversation}
                        isActive={selectedConversationId === conversation.id}
                        currentUserId={currentUserId}
                        participantStatus={resolvePresence(ps)}
                        draft={drafts.get(conversation.id)}
                      />
                      {index < filteredArchived.length - 1 && <Separator />}
                    </div>
                  )
                })}
                {hasMoreConversations && (
                  <Button
                    variant="ghost"
                    className="mx-3 my-2 w-[calc(100%-1.5rem)]"
                    disabled={loadingMoreConversations}
                    onClick={() => void loadMoreConversations()}
                  >
                    {loadingMoreConversations ? t('chat.loadingOlder') : t('chatList.loadMore')}
                  </Button>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
                <Archive className="mb-3 h-12 w-12 opacity-50" />
                <p className="text-sm">{t('chatList.noArchived')}</p>
              </div>
            )
          ) : sortedConversations.length > 0 ? (
            <>
              {sortedConversations.map((conversation, index) => {
                const ps = conversation.participant
                  ? participantStatuses.get(conversation.participant.id)
                  : undefined
                return (
                  <div key={conversation.id}>
                    <ConversationItem
                      conversation={conversation}
                      isActive={selectedConversationId === conversation.id}
                      currentUserId={currentUserId}
                      participantStatus={resolvePresence(ps)}
                      draft={drafts.get(conversation.id)}
                    />
                    {index < sortedConversations.length - 1 && <Separator />}
                  </div>
                )
              })}
              {hasMoreConversations && (
                <Button
                  variant="ghost"
                  className="mx-3 my-2 w-[calc(100%-1.5rem)]"
                  disabled={loadingMoreConversations}
                  onClick={() => void loadMoreConversations()}
                >
                  {loadingMoreConversations ? t('chat.loadingOlder') : t('chatList.loadMore')}
                </Button>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
              <MessageSquare className="mb-3 h-12 w-12 opacity-50" />
              <p className="text-sm">
                {activeTab === 'unread' ? t('chatList.noUnread') : t('chatList.noConversations')}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
