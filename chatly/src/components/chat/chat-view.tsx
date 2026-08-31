'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Phone,
  Video,
  MoreVertical,
  ArrowLeft,
  Send,
  Smile,
  Check,
  CheckCheck,
  Pencil,
  Clock,
} from 'lucide-react'
import { cn, getCompactDisplayName } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { createClient } from '@/lib/supabase/client'
import { useTyping } from '@/hooks/use-typing'
import { useReadReceipts } from '@/hooks/use-read-receipts'
import { useConversationMedia } from '@/hooks/use-conversation-media'
import { MediaMessageBubble } from './media-message-bubble'
import { MediaAttachmentButton } from './media-attachment-button'
import { MediaGalleryViewer } from './media-gallery'
import { MessageContextMenu } from './message-context-menu'
import { ReplyPreview } from './reply-preview'
import { MessageReactions } from './message-reactions'
import { ForwardModal } from './forward-modal'
import { BlockUserModal } from './block-user-modal'
import { ConversationActions } from './conversation-actions'
import { SchedulePicker } from './schedule-picker'
import { EmojiPicker } from './emoji-picker'
import { SearchModal } from './search-modal'
import { useMessageActionsStore } from '@/stores/message-actions-store'
import { useNotificationStore } from '@/stores/notification-store'
import { useDraftStore } from '@/stores/draft-store'
import { useScheduledMessagesProcessor } from '@/hooks/use-scheduled-messages-processor'
import { createScheduledMessage } from '@/lib/actions/scheduled-messages'
import { editMessage, deleteMessage } from '@/lib/actions/messages'
import { useChatCacheStore } from '@/stores/chat-cache-store'
import { resolvePresence, type PresenceStatus } from '@/lib/presence'
import { useI18n } from '@/lib/i18n'
import type { Tables } from '@/types'

type Message = Tables<'messages'>
type Profile = Tables<'profiles'>
type MessageContentType = 'text' | 'image' | 'video' | 'audio' | 'file'

function formatMessageDate(dateStr: string, dateLocale: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString(dateLocale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function formatMessageTime(dateStr: string, dateLocale: string): string {
  const date = new Date(dateStr)
  return date.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })
}

function getDateSeparator(messages: Message[], index: number, dateLocale: string): string | null {
  const currentDate = messages[index].created_at
  const prevDate = index > 0 ? messages[index - 1].created_at : null

  if (!currentDate) return null

  const current = new Date(currentDate)
  const prev = prevDate ? new Date(prevDate) : null

  if (!prev || current.toDateString() !== prev.toDateString()) {
    return formatMessageDate(currentDate, dateLocale)
  }
  return null
}

interface MessageBubbleProps {
  message: Message
  showAvatar: boolean
  participant: Profile
  isFromMe: boolean
  currentUserId: string
  realtimeStatus?: string
  reactions?: { emoji: string; count: number; userReacted: boolean }[]
  onToggleReaction?: (emoji: string) => void
  replyToMessage?: Message | null
  onReplyClick?: (messageId: string) => void
}

function MessageBubble({
  message,
  showAvatar,
  participant,
  isFromMe,
  currentUserId,
  realtimeStatus,
  reactions = [],
  onToggleReaction,
  replyToMessage,
  onReplyClick,
}: MessageBubbleProps) {
  const { t, dateLocale } = useI18n()
  const [isHovered, setIsHovered] = useState(false)
  const { openContextMenu } = useMessageActionsStore()
  const messageStatus = realtimeStatus || message.status || 'sent'
  const contentType = message.content_type as MessageContentType
  const isDeleted = !!message.deleted_at
  const isSticker =
    contentType === 'text' &&
    !!message.content?.trim() &&
    message.content.trim().length <= 12 &&
    !/[\p{L}\p{N}]/u.test(message.content)

  const handleReplyClick = () => {
    if (replyToMessage?.id && onReplyClick) {
      onReplyClick(replyToMessage.id)
    }
  }

  const renderReplyQuote = () => {
    if (!message.reply_to || !replyToMessage) return null

    const replyContent = replyToMessage.deleted_at
      ? t('chat.deletedQuote')
      : replyToMessage.content || t('chat.mediaQuote')

    const replySender =
      replyToMessage.sender_id === currentUserId
        ? t('common.you')
        : participant?.display_name || t('common.user')

    return (
      <div
        onClick={handleReplyClick}
        className={cn(
          'mb-2 cursor-pointer border-l-2 pl-2 transition-colors',
          isFromMe
            ? 'border-white/40 hover:border-white/70'
            : 'border-primary-500/60 hover:border-primary-500'
        )}
      >
        <p className={cn('text-xs font-medium', isFromMe ? 'text-white/80' : 'text-primary-500')}>
          {replySender}
        </p>
        <p
          className={cn(
            'line-clamp-1 text-xs',
            isFromMe ? 'text-white/70' : 'text-[var(--text-muted)]'
          )}
        >
          {replyContent}
        </p>
      </div>
    )
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    openContextMenu(message, { x: e.clientX, y: e.clientY })
  }

  const renderTimeAndStatus = () => (
    <div
      className={cn(
        'mt-0.5 flex items-center gap-1 text-xs text-[var(--text-muted)]',
        isFromMe && 'justify-end'
      )}
    >
      {message.edited_at && <span className="italic">({t('chat.edited')})</span>}
      <span>{message.created_at ? formatMessageTime(message.created_at, dateLocale) : ''}</span>
      {isFromMe && (
        <span className="flex">
          {messageStatus === 'read' ? (
            <CheckCheck className="h-3.5 w-3.5 text-emerald-500" />
          ) : messageStatus === 'delivered' ? (
            <CheckCheck className="h-3.5 w-3.5 text-[var(--text-muted)]" />
          ) : messageStatus === 'sent' || messageStatus === 'sending' ? (
            <Check className="h-3.5 w-3.5" />
          ) : null}
        </span>
      )}
    </div>
  )

  // Render deleted message placeholder
  if (isDeleted) {
    return (
      <div
        className={cn('animate-fade-in flex', isFromMe ? 'justify-end' : 'justify-start')}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className={cn('flex max-w-[75%] gap-2', isFromMe && 'flex-row-reverse')}>
          <div className={cn('w-8 shrink-0', !showAvatar && 'invisible')}>
            {!isFromMe && <Avatar user={participant} size="sm" showStatus={false} />}
          </div>
          <div>
            <div
              className={cn(
                'rounded-2xl px-4 py-2 italic',
                isFromMe
                  ? 'bg-primary-500/50 rounded-br-md text-white/70'
                  : 'rounded-bl-md bg-[var(--bg-message-in)] text-[var(--text-muted)]'
              )}
            >
              <p className="text-sm">{t('chat.messageDeleted')}</p>
            </div>
            {renderTimeAndStatus()}
          </div>
        </div>
      </div>
    )
  }

  // Render media content for media messages
  if (contentType && contentType !== 'text' && message.media_url) {
    return (
      <div
        className={cn('animate-fade-in flex', isFromMe ? 'justify-end' : 'justify-start')}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          className={cn('flex max-w-[85%] flex-col gap-1 md:max-w-[75%]', isFromMe && 'items-end')}
        >
          <div className={cn('flex max-w-full gap-2', isFromMe && 'flex-row-reverse')}>
            {/* Avatar */}
            <div className={cn('w-8 shrink-0', !showAvatar && 'invisible')}>
              {!isFromMe && <Avatar user={participant} size="sm" showStatus={false} />}
            </div>

            {/* Media Bubble */}
            <div>
              <MediaMessageBubble message={message} isFromMe={isFromMe} />
              {renderTimeAndStatus()}
            </div>
          </div>
          {/* Always show reactions row - emoji picker button appears on hover */}
          <MessageReactions
            messageId={message.id}
            reactions={reactions}
            onToggleReaction={onToggleReaction || (() => {})}
            showAddButton={isHovered}
          />
        </div>
      </div>
    )
  }

  // Render text content
  return (
    <div
      className={cn('animate-fade-in flex', isFromMe ? 'justify-end' : 'justify-start')}
      onContextMenu={handleContextMenu}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={cn('flex max-w-[85%] flex-col gap-1 md:max-w-[75%]', isFromMe && 'items-end')}
      >
        <div className={cn('flex max-w-full gap-2', isFromMe && 'flex-row-reverse')}>
          {/* Avatar */}
          <div className={cn('w-8 shrink-0', !showAvatar && 'invisible')}>
            {!isFromMe && <Avatar user={participant} size="sm" showStatus={false} />}
          </div>

          {/* Bubble */}
          <div>
            <div
              className={cn(
                'max-w-full rounded-2xl px-4 py-2',
                isSticker && 'bg-transparent p-1',
                isFromMe
                  ? !isSticker && 'bg-primary-500 rounded-br-md text-white'
                  : !isSticker && 'rounded-bl-md bg-[var(--bg-message-in)]'
              )}
            >
              {renderReplyQuote()}
              <p
                className={cn(
                  '[overflow-wrap:anywhere] break-words whitespace-pre-wrap',
                  isSticker ? 'text-5xl leading-none' : 'text-sm'
                )}
              >
                {message.content}
              </p>
            </div>
            {renderTimeAndStatus()}
          </div>
        </div>
        {/* Always show reactions row - emoji picker button appears on hover */}
        <MessageReactions
          messageId={message.id}
          reactions={reactions}
          onToggleReaction={onToggleReaction || (() => {})}
          showAddButton={isHovered}
        />
      </div>
    </div>
  )
}

interface ChatViewProps {
  conversationId: string | null
  currentUserId: string
  onBack?: () => void
  showBackButton?: boolean
  scrollToMessageId?: string
}

export function ChatView({
  conversationId,
  currentUserId,
  onBack,
  showBackButton = false,
  scrollToMessageId,
}: ChatViewProps) {
  const router = useRouter()
  const { t, dateLocale } = useI18n()
  // Use cache store so navigating between chats is instant (no loading flash).
  // Select only the methods we need to avoid re-rendering on every cache mutation.
  const getCached = useChatCacheStore((s) => s.getCached)
  const setCached = useChatCacheStore((s) => s.setCached)
  const getInput = useChatCacheStore((s) => s.getInput)
  const setInput = useChatCacheStore((s) => s.setInput)
  const cached = conversationId ? getCached(conversationId) : undefined

  const [messages, setMessages] = useState<Message[]>(cached?.messages || [])
  const [participant, setParticipant] = useState<Profile | null>(cached?.participant || null)
  const [inputValue, setInputValue] = useState(() =>
    conversationId ? getInput(conversationId) : ''
  )
  // Show loading only if we don't have cached data
  const [loading, setLoading] = useState(!cached)
  const [sending, setSending] = useState(false)
  // Track the raw status + last_seen from realtime so we can recompute the
  // *effective* status (a stale "online" should show as offline).
  const [participantStatusRaw, setParticipantStatusRaw] = useState<{
    status: PresenceStatus
    lastSeen: string | null
  }>(() => {
    const cachedStatus = cached?.participantStatus || 'offline'
    return { status: cachedStatus, lastSeen: null }
  })
  const participantStatus = resolvePresence(participantStatusRaw)
  const [showMediaGallery, setShowMediaGallery] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  // Track realtime status for messages
  const [messageStatuses, setMessageStatuses] = useState<Map<string, string>>(
    cached?.messageStatuses || new Map()
  )
  // Edit state
  const [editingMessage, setEditingMessage] = useState<Message | null>(null)
  // Reactions per message
  const [messageReactions, setMessageReactions] = useState<
    Map<string, { emoji: string; count: number; userReacted: boolean }[]>
  >(cached?.messageReactions || new Map())
  // Store hooks
  const { replyToMessage, clearReply } = useMessageActionsStore()
  const addToast = useNotificationStore((state) => state.addToast)

  // Draft messages
  const { getDraft, setDraft, clearDraft } = useDraftStore()

  // Auto-process scheduled messages that are due (handles its own state)
  useScheduledMessagesProcessor()

  // Create schedule function (no hook needed)
  const createSchedule = useCallback(
    async (
      conversationId: string,
      content: string,
      scheduledAt: Date,
      options?: {
        contentType?: string
        mediaUrl?: string | null
        replyTo?: string | null
      }
    ) => {
      const result = await createScheduledMessage({
        conversationId,
        content,
        scheduledAt,
        contentType: options?.contentType,
        mediaUrl: options?.mediaUrl,
        replyTo: options?.replyTo,
      })
      return result
    },
    []
  )

  // Schedule picker
  const [showSchedulePicker, setShowSchedulePicker] = useState(false)

  // Block user modal
  const [blockModalOpen, setBlockModalOpen] = useState(false)
  const [userToBlock, setUserToBlock] = useState<{
    id: string
    display_name: string
    avatar_url: string | null
  } | null>(null)

  // Conversation actions menu
  const [showConversationActions, setShowConversationActions] = useState(false)
  const conversationActionsRef = useRef<HTMLDivElement>(null)
  // Track participation flags for this conversation
  const [conversationFlags, setConversationFlags] = useState({
    is_pinned: false,
    is_muted: false,
    is_archived: false,
  })

  // Sync current state into cache so navigating away/back is instant
  useEffect(() => {
    if (!conversationId) return
    setCached(conversationId, {
      messages,
      participant,
      participantStatus,
      messageStatuses,
      messageReactions,
    })
  }, [
    conversationId,
    messages,
    participant,
    participantStatus,
    messageStatuses,
    messageReactions,
    setCached,
  ])

  // Persist input value per conversation (so draft survives navigation)
  useEffect(() => {
    if (conversationId) {
      setInput(conversationId, inputValue)
    }
  }, [conversationId, inputValue, setInput])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const supabase = createClient()

  // Typing indicators
  const { typingUserIds, onType, stopTyping } = useTyping(conversationId, currentUserId)

  // Read receipts - marks messages as read
  const { markAsRead } = useReadReceipts(conversationId, currentUserId)

  // Media gallery
  const { mediaItems } = useConversationMedia({ conversationId })

  // Fetch participant info and their status
  useEffect(() => {
    const fetchParticipant = async () => {
      if (!conversationId || !currentUserId) {
        return
      }

      try {
        // Fetch flags in parallel with participants
        const { data: myParticipation } = await supabase
          .from('conversation_participants')
          .select('is_pinned, is_muted, is_archived')
          .eq('conversation_id', conversationId)
          .eq('user_id', currentUserId)
          .single()

        if (myParticipation) {
          setConversationFlags({
            is_pinned: !!myParticipation.is_pinned,
            is_muted: !!myParticipation.is_muted,
            is_archived: !!myParticipation.is_archived,
          })
        }

        const { data: otherParticipants } = await supabase
          .from('conversation_participants')
          .select('user_id')
          .eq('conversation_id', conversationId)
          .neq('user_id', currentUserId)

        const otherUserId = otherParticipants?.[0]?.user_id
        if (otherUserId) {
          // Get profile with status
          const { data } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', otherUserId)
            .single()
          setParticipant(data)

          // Set initial status from profile
          if (data) {
            setParticipantStatusRaw({
              status: (data.status as PresenceStatus) || 'offline',
              lastSeen: data.last_seen ?? null,
            })
          }
        }
      } catch (err) {
        console.error('Failed to fetch participant:', err)
      }
    }

    fetchParticipant()
  }, [conversationId, currentUserId, supabase])

  // Subscribe to participant's status changes
  useEffect(() => {
    if (!participant?.id || !currentUserId) return

    const channel = supabase
      .channel(`participant-status-${participant.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${participant.id}`,
        },
        async (payload) => {
          const updated = payload.new as Profile
          const oldEffective = participantStatus
          const newStatus = (updated.status as PresenceStatus) || 'offline'
          setParticipantStatusRaw({
            status: newStatus,
            lastSeen: updated.last_seen ?? null,
          })

          // When participant comes online, refresh message statuses
          // This ensures messages that were "sent" (recipient offline) become "delivered"
          const newEffective = resolvePresence({
            status: newStatus,
            lastSeen: updated.last_seen ?? null,
          })
          if (oldEffective !== 'online' && newEffective === 'online' && conversationId) {
            try {
              const { data } = await supabase
                .from('messages')
                .select('*')
                .eq('conversation_id', conversationId)
                .eq('status', 'sent')
                .neq('sender_id', currentUserId)

              // Refresh all messages to get updated statuses
              if (data && data.length > 0) {
                const { data: allMessages } = await supabase
                  .from('messages')
                  .select('*')
                  .eq('conversation_id', conversationId)
                  .order('created_at', { ascending: true })
                if (allMessages) {
                  setMessages(allMessages)
                }
              }
            } catch (err) {
              console.error('Failed to refresh messages:', err)
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [participant?.id, supabase, participantStatus, conversationId, currentUserId])

  // Fetch messages
  useEffect(() => {
    const fetchMessages = async () => {
      if (!conversationId || !currentUserId) {
        setMessages([])
        setLoading(false)
        return
      }

      // If we have cached data, don't show loading — just refresh in background
      const hasCached = !!getCached(conversationId)
      if (!hasCached) {
        setLoading(true)
      }

      try {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true })

        if (error) throw error
        setMessages(data || [])

        // Mark messages as read
        markAsRead()
      } catch (err) {
        console.error('Failed to fetch messages:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchMessages()
  }, [conversationId, currentUserId, supabase, markAsRead, getCached])

  // Subscribe to real-time messages and status updates
  useEffect(() => {
    if (!conversationId || !currentUserId) return

    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const newMessage = payload.new as Message
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMessage.id)) return prev
            return [...prev, newMessage]
          })

          // Mark as read if from other user
          if (newMessage.sender_id !== currentUserId) {
            markAsRead()
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as Message
          const old = payload.old as Message | undefined

          // Update message in list - sync ALL changes (content, edited_at, status, deleted_at)
          setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))

          // Also update status tracking for display
          if (updated.status !== old?.status) {
            setMessageStatuses((prev) => {
              const next = new Map(prev)
              next.set(updated.id, updated.status || 'sent')
              return next
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, currentUserId, supabase, markAsRead])

  // Subscribe to reactions for all messages in this conversation
  useEffect(() => {
    if (!conversationId || messages.length === 0) return

    // Get message IDs for this conversation
    const messageIds = messages
      .filter((msg) => msg.id && !msg.id.startsWith('temp-'))
      .map((msg) => msg.id)

    if (messageIds.length === 0) return

    const channel = supabase
      .channel(`reactions-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
        },
        async () => {
          // Refetch all reactions for this conversation
          const { getReactionsForMessages } = await import('@/lib/actions/messages')
          try {
            const newReactions = await getReactionsForMessages(messageIds)
            setMessageReactions(newReactions)
          } catch (err) {
            console.error('Failed to refetch reactions:', err)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, messages, supabase])

  // Scroll to bottom when messages change (only if no scrollToMessageId)
  useEffect(() => {
    if (!scrollToMessageId) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, scrollToMessageId])

  // Scroll to specific message when scrollToMessageId is set
  useEffect(() => {
    if (!scrollToMessageId || !messages.length) return

    // Find the message in the list
    const messageIndex = messages.findIndex((m) => m.id === scrollToMessageId)
    if (messageIndex === -1) return

    // Wait for render then scroll
    const timeoutId = setTimeout(() => {
      const messageEl = messageRefs.current.get(scrollToMessageId)
      if (messageEl) {
        messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
        // Add highlight effect
        messageEl.classList.add('ring-2', 'ring-primary-500', 'ring-offset-2')
        setTimeout(() => {
          messageEl.classList.remove('ring-2', 'ring-primary-500', 'ring-offset-2')
        }, 2000)
      }
    }, 100)

    return () => clearTimeout(timeoutId)
  }, [scrollToMessageId, messages])

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [conversationId])

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.style.height = 'auto'
    input.style.height = `${Math.min(input.scrollHeight, 128)}px`
  }, [inputValue])

  // When conversationId changes, restore cached state immediately
  const prevConversationIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (prevConversationIdRef.current === conversationId) return
    prevConversationIdRef.current = conversationId

    const frameId = window.requestAnimationFrame(() => {
      if (!conversationId) {
        setMessages([])
        setParticipant(null)
        setParticipantStatusRaw({ status: 'offline', lastSeen: null })
        setMessageStatuses(new Map())
        setMessageReactions(new Map())
        setInputValue('')
        setEditingMessage(null)
        setLoading(false)
        return
      }

      // Restore from cache if available
      const cached = getCached(conversationId)
      if (cached) {
        setMessages(cached.messages)
        setParticipant(cached.participant)
        setParticipantStatusRaw({
          status: cached.participantStatus,
          lastSeen: cached.participant?.last_seen ?? null,
        })
        setMessageStatuses(cached.messageStatuses)
        setMessageReactions(cached.messageReactions)
        setInputValue(getInput(conversationId))
        // No loading — we have data; background refetch will refresh
      } else {
        // No cache — start fresh
        setMessages([])
        setParticipant(null)
        setParticipantStatusRaw({ status: 'offline', lastSeen: null })
        setMessageStatuses(new Map())
        setMessageReactions(new Map())
        setInputValue(getInput(conversationId))
        setEditingMessage(null)
        setLoading(true)
      }
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [conversationId, getCached, getInput])

  // Restore draft when conversation changes (fallback to draft store)
  useEffect(() => {
    if (!conversationId) return
    const timeoutId = window.setTimeout(() => {
      const draft = getDraft(conversationId)
      const cachedInput = getInput(conversationId)
      // Prefer cache (more recent), fall back to draft store
      const finalValue = cachedInput || draft
      if (finalValue) {
        setInputValue(finalValue)
      }
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [conversationId, getDraft, getInput])

  // Cleanup typing on unmount
  useEffect(() => {
    return () => {
      stopTyping()
    }
  }, [stopTyping])

  // ============================================================================
  // Edit Message Handler
  // ============================================================================
  const handleEdit = useCallback(
    async (message: Message) => {
      if (!message.content || !inputValue.trim()) return

      setSending(true)
      const newContent = inputValue.trim()

      try {
        const result = await editMessage(message.id, newContent)

        if (result.success && result.message) {
          // Update local message list
          setMessages((prev) =>
            prev.map((m) => (m.id === message.id ? { ...m, ...result.message } : m))
          )
          setEditingMessage(null)
          setInputValue('')
          addToast({ type: 'system', title: t('chat.messageEdited'), body: '' })
        } else {
          addToast({
            type: 'system',
            title: t('chat.editFailed'),
            body: result.error || t('common.unknownError'),
          })
        }
      } catch (err) {
        console.error('Failed to edit message:', err)
        addToast({
          type: 'system',
          title: t('chat.editFailed'),
          body: err instanceof Error ? err.message : t('common.unknownError'),
        })
      } finally {
        setSending(false)
      }
    },
    [inputValue, addToast, t]
  )

  // ============================================================================
  // Delete Message Handler
  // ============================================================================
  const handleDelete = useCallback(
    async (message: Message) => {
      // Show confirmation dialog
      if (!confirm(t('chat.deleteMessageConfirm'))) return

      try {
        const result = await deleteMessage(message.id)

        if (result.success) {
          // Update local message list (mark as deleted)
          setMessages((prev) =>
            prev.map((m) =>
              m.id === message.id ? { ...m, deleted_at: new Date().toISOString() } : m
            )
          )
          addToast({ type: 'system', title: t('chat.messageDeletedToast'), body: '' })
        } else {
          addToast({
            type: 'system',
            title: t('chat.deleteFailed'),
            body: result.error || t('common.unknownError'),
          })
        }
      } catch (err) {
        console.error('Failed to delete message:', err)
        addToast({
          type: 'system',
          title: t('chat.deleteFailed'),
          body: err instanceof Error ? err.message : t('common.unknownError'),
        })
      }
    },
    [addToast, t]
  )

  // ============================================================================
  // Send Message Handler (supports reply)
  // ============================================================================
  const handleSend = useCallback(
    async (contentOverride?: string) => {
      // If editing, handle edit instead
      if (editingMessage && contentOverride === undefined) {
        handleEdit(editingMessage)
        return
      }

      const pendingContent = contentOverride ?? inputValue
      if (!pendingContent.trim() || !conversationId || sending) return

      stopTyping()
      setSending(true)
      const content = pendingContent.trim()
      if (contentOverride === undefined) setInputValue('')

      // Optimistic update
      const optimisticMessage: Message = {
        id: `temp-${Date.now()}`,
        conversation_id: conversationId,
        sender_id: currentUserId,
        content,
        content_type: 'text',
        status: 'sent',
        created_at: new Date().toISOString(),
        edited_at: null,
        deleted_at: null,
        reply_to: replyToMessage?.id || null,
        media_url: null,
        media_thumbnail_url: null,
        media_name: null,
        media_size: null,
        media_mime_type: null,
      }
      setMessages((prev) => [...prev, optimisticMessage])

      try {
        const insertPayload = {
          conversation_id: conversationId,
          sender_id: currentUserId,
          content,
          status: 'sent',
          reply_to: replyToMessage?.id || null,
        }
        const { data, error } = await supabase
          .from('messages')
          .insert(insertPayload)
          .select()
          .single()

        if (error) throw error

        // Replace optimistic message with real one
        setMessages((prev) => prev.map((m) => (m.id === optimisticMessage.id ? data : m)))

        // Clear reply state and draft
        clearReply()
        clearDraft(conversationId)

        // Update conversation's last_message_at
        await supabase
          .from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', conversationId)
      } catch (err) {
        console.error('Failed to send message:', err)
        setMessages((prev) => prev.filter((m) => m.id !== optimisticMessage.id))
        if (contentOverride === undefined) setInputValue(content)
      } finally {
        setSending(false)
      }
    },
    [
      inputValue,
      conversationId,
      currentUserId,
      sending,
      supabase,
      stopTyping,
      editingMessage,
      handleEdit,
      replyToMessage,
      clearReply,
      clearDraft,
    ]
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value)
    if (e.target.value.trim()) {
      onType()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleSend()
    }
  }

  // ============================================================================
  // Reaction Handler
  // ============================================================================
  const handleToggleReaction = useCallback(async (messageId: string, emoji: string) => {
    const { toggleReaction } = await import('@/lib/actions/messages')

    // Optimistic update
    setMessageReactions((prev) => {
      const next = new Map(prev)
      const existing = next.get(messageId) || []
      const emojiIndex = existing.findIndex((r) => r.emoji === emoji)

      if (emojiIndex >= 0) {
        const updated = [...existing]
        if (updated[emojiIndex].count <= 1) {
          updated.splice(emojiIndex, 1)
        } else {
          updated[emojiIndex] = {
            ...updated[emojiIndex],
            count: updated[emojiIndex].count - 1,
            userReacted: false,
          }
        }
        next.set(messageId, updated)
      } else {
        next.set(messageId, [...existing, { emoji, count: 1, userReacted: true }])
      }
      return next
    })

    try {
      await toggleReaction(messageId, emoji)
    } catch (err) {
      console.error('Failed to toggle reaction:', err)
    }
  }, [])

  // Fetch reactions when messages change (optimized batch query)
  useEffect(() => {
    const fetchReactions = async () => {
      const { getReactionsForMessages } = await import('@/lib/actions/messages')

      // Get non-temp message IDs
      const messageIds = messages
        .filter((msg) => msg.id && !msg.id.startsWith('temp-'))
        .map((msg) => msg.id)

      if (messageIds.length === 0) return

      try {
        const newReactions = await getReactionsForMessages(messageIds)
        setMessageReactions(newReactions)
      } catch (err) {
        console.error('Failed to fetch reactions:', err)
      }
    }

    if (messages.length > 0) {
      fetchReactions()
    }
  }, [messages])

  // Get typing text
  const getTypingText = (): string => {
    if (typingUserIds.length === 0) return ''
    return t('chat.typing')
  }

  // Status text for header
  const getStatusText = (): string => {
    if (typingUserIds.length > 0) {
      return getTypingText()
    }
    switch (participantStatus) {
      case 'online':
        return t('chat.online')
      case 'away':
        return t('chat.away')
      case 'busy':
        return t('chat.busy')
      default:
        return t('chat.offline')
    }
  }

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

  if (!conversationId) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[var(--bg-app)] text-[var(--text-muted)]">
        <div className="text-center">
          <p className="text-lg">{t('chat.selectConversation')}</p>
          <p className="mt-2 text-sm">{t('chat.chooseConversation')}</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[var(--bg-app)]">
        <div className="border-primary-500 h-8 w-8 animate-spin rounded-full border-3 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="relative flex h-full w-full min-w-0 flex-col overflow-hidden bg-[var(--bg-app)]">
      {/* Header */}
      <div className="flex min-w-0 items-center gap-1 border-b border-[var(--border-default)] bg-[var(--bg-panel)] px-2 py-2.5 sm:gap-3 md:px-4 md:py-3">
        {showBackButton && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onBack}
            className="shrink-0 sm:mr-1"
            aria-label={t('common.back')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}

        {participant && (
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            {/* Avatar with dynamic status */}
            <div className="relative shrink-0">
              <Avatar user={participant} size="md" showStatus={false} />
              <span
                className={cn(
                  'absolute right-0 bottom-0 h-3 w-3 rounded-full border-2 border-[var(--bg-panel)]',
                  getStatusColor()
                )}
              />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-semibold text-[var(--text-primary)]">
                {getCompactDisplayName(participant.display_name)}
              </h2>
              <p
                className={cn(
                  'truncate text-xs',
                  typingUserIds.length > 0
                    ? 'text-primary-500 animate-pulse'
                    : 'text-[var(--text-secondary)]'
                )}
              >
                {getStatusText()}
              </p>
            </div>
          </div>
        )}

        {!participant && showBackButton && <div className="flex-1" />}

        {/* Actions */}
        <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 sm:h-10 sm:w-10"
            aria-label={t('chat.voiceCall')}
            onClick={() => {
              if (conversationId && participant) {
                // Dispatch event for CallProvider to handle
                window.dispatchEvent(
                  new CustomEvent('call:initiate', {
                    detail: {
                      conversationId,
                      remoteUser: {
                        id: participant.id,
                        displayName: participant.display_name,
                        avatarUrl: participant.avatar_url || undefined,
                      },
                      type: 'voice',
                    },
                  })
                )
              }
            }}
          >
            <Phone className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 sm:h-10 sm:w-10"
            aria-label={t('chat.videoCall')}
            onClick={() => {
              if (conversationId && participant) {
                // Dispatch event for CallProvider to handle
                window.dispatchEvent(
                  new CustomEvent('call:initiate', {
                    detail: {
                      conversationId,
                      remoteUser: {
                        id: participant.id,
                        displayName: participant.display_name,
                        avatarUrl: participant.avatar_url || undefined,
                      },
                      type: 'video',
                    },
                  })
                )
              }
            }}
          >
            <Video className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowConversationActions(true)}
            className="h-9 w-9 sm:h-10 sm:w-10"
            aria-label={t('chat.options')}
          >
            <MoreVertical className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="min-w-0 flex-1 p-2 sm:p-4">
        <div className="space-y-4">
          {messages.map((message, index) => {
            const showDateSeparator = getDateSeparator(messages, index, dateLocale)
            const showAvatar = index === 0 || messages[index - 1].sender_id !== message.sender_id
            const isFromMe = message.sender_id === currentUserId
            // Get realtime status for this message
            const realtimeStatus = messageStatuses.get(message.id)

            return (
              <div
                key={message.id}
                ref={(el) => {
                  if (el) messageRefs.current.set(message.id, el)
                }}
              >
                {showDateSeparator && (
                  <div className="my-4 flex items-center gap-4">
                    <div className="flex-1 border-t border-[var(--border-default)]" />
                    <span className="text-xs font-medium text-[var(--text-muted)]">
                      {showDateSeparator}
                    </span>
                    <div className="flex-1 border-t border-[var(--border-default)]" />
                  </div>
                )}
                <MessageBubble
                  message={message}
                  showAvatar={showAvatar}
                  participant={participant!}
                  isFromMe={isFromMe}
                  currentUserId={currentUserId}
                  realtimeStatus={realtimeStatus}
                  reactions={messageReactions.get(message.id) || []}
                  onToggleReaction={(emoji) => handleToggleReaction(message.id, emoji)}
                  replyToMessage={
                    message.reply_to ? messages.find((m) => m.id === message.reply_to) : null
                  }
                  onReplyClick={(msgId) => {
                    // Scroll to replied message
                    const el = messageRefs.current.get(msgId)
                    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  }}
                />
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-[var(--border-default)] bg-[var(--bg-panel)] p-2 sm:p-3">
        <div className="flex min-w-0 items-end gap-0.5 sm:gap-2">
          <div className="relative shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowEmojiPicker((open) => !open)}
              className="h-9 w-9 sm:h-10 sm:w-10"
              aria-label={t('chat.emojiSticker')}
            >
              <Smile className="h-5 w-5 text-[var(--text-muted)]" />
            </Button>
            {showEmojiPicker && (
              <EmojiPicker
                onSelect={(emoji) => {
                  setInputValue((current) => `${current}${emoji}`)
                  inputRef.current?.focus()
                }}
                onSelectSticker={(sticker) => {
                  setShowEmojiPicker(false)
                  void handleSend(sticker)
                }}
                onClose={() => setShowEmojiPicker(false)}
              />
            )}
          </div>

          <MediaAttachmentButton
            conversationId={conversationId}
            userId={currentUserId}
            onUploadComplete={(msg) => {
              // Add new message to list
              setMessages((prev) => {
                if (prev.some((m) => m.id === msg.id)) return prev
                return [...prev, msg]
              })
            }}
          />

          <div className="min-w-0 flex-1">
            <textarea
              ref={inputRef}
              rows={1}
              placeholder={editingMessage ? t('chat.editMessage') : t('chat.typeMessage')}
              value={inputValue}
              onChange={(e) => {
                handleInputChange(e)
                // Auto-save draft
                if (conversationId && e.target.value.trim()) {
                  setDraft(conversationId, e.target.value)
                }
              }}
              onKeyDown={handleKeyDown}
              className="focus:ring-primary-500 block min-h-10 w-full resize-none overflow-y-auto rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:ring-2 focus:ring-offset-1 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              disabled={sending}
            />
          </div>

          {/* Schedule button */}
          {inputValue.trim() && !editingMessage && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSchedulePicker(true)}
              title={t('chat.schedule')}
              aria-label={t('chat.schedule')}
              className="h-9 w-9 shrink-0 sm:h-10 sm:w-10"
            >
              <Clock className="h-5 w-5 text-[var(--text-muted)]" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleSend()}
            disabled={!inputValue.trim() || sending}
            className={cn(
              'h-9 w-9 shrink-0 transition-all sm:h-10 sm:w-10',
              inputValue.trim() && !sending && 'bg-primary-500 hover:bg-primary-600 text-white'
            )}
            aria-label={t('chat.send')}
          >
            {editingMessage ? <Pencil className="h-5 w-5" /> : <Send className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Reply Preview */}
      <ReplyPreview replyingTo={replyToMessage} replyingToProfile={participant} />

      {/* Media Gallery Modal */}
      {showMediaGallery && (
        <MediaGalleryViewer
          items={mediaItems.map((item) => ({
            id: item.id,
            url: item.url,
            type: item.type,
            name: item.name,
            size: item.size,
            mimeType: item.mimeType,
          }))}
          onClose={() => setShowMediaGallery(false)}
        />
      )}

      {/* Context Menu */}
      <MessageContextMenu
        currentUserId={currentUserId}
        onEdit={(message) => {
          setEditingMessage(message)
          setInputValue(message.content || '')
        }}
        onDelete={handleDelete}
        onBlockUser={(userId, userName) => {
          setUserToBlock({ id: userId, display_name: userName, avatar_url: null })
          setBlockModalOpen(true)
        }}
      />

      {/* Forward Modal */}
      <ForwardModal
        currentUserId={currentUserId}
        onForwardComplete={() => {
          // Optionally scroll or do something after forward
        }}
      />

      {/* Block User Modal */}
      <BlockUserModal
        isOpen={blockModalOpen}
        onClose={() => setBlockModalOpen(false)}
        userToBlock={userToBlock}
        onBlocked={() => {
          // Refresh conversations list
        }}
      />

      {/* Conversation Actions Menu */}
      {showConversationActions && participant && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowConversationActions(false)} />
          <div
            ref={conversationActionsRef}
            className="absolute top-14 right-2 z-50 sm:top-16 sm:right-4"
          >
            <ConversationActions
              conversationId={conversationId}
              conversationTitle={participant.display_name}
              userId={currentUserId}
              isPinned={conversationFlags.is_pinned}
              isMuted={conversationFlags.is_muted}
              isArchived={conversationFlags.is_archived}
              onClose={() => setShowConversationActions(false)}
              onSearch={() => setShowSearch(true)}
              onOpenMedia={() => setShowMediaGallery(true)}
              onAction={(updates) => {
                setConversationFlags((prev) => ({
                  ...prev,
                  ...updates,
                }))
              }}
            />
          </div>
        </>
      )}

      <SearchModal
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        conversationId={conversationId}
        currentUserId={currentUserId}
        onSelectMessage={(result) => {
          const messageElement = messageRefs.current.get(result.id)
          if (!messageElement) {
            router.replace(`/chats/${conversationId}?scrollTo=${result.id}`)
            return
          }

          messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
          messageElement.classList.add('ring-2', 'ring-primary-500', 'ring-offset-2')
          window.setTimeout(() => {
            messageElement.classList.remove('ring-2', 'ring-primary-500', 'ring-offset-2')
          }, 2000)
        }}
      />

      {/* Schedule Picker Modal */}
      <SchedulePicker
        isOpen={showSchedulePicker}
        onClose={() => setShowSchedulePicker(false)}
        onSchedule={async (scheduledAt) => {
          if (conversationId && inputValue.trim()) {
            const result = await createSchedule(conversationId, inputValue.trim(), scheduledAt, {
              replyTo: replyToMessage?.id,
            })
            if (result.success) {
              setInputValue('')
              clearReply()
              clearDraft(conversationId)
              addToast({
                type: 'system',
                title: t('chat.scheduled'),
                body: t('chat.scheduledAt', {
                  time: scheduledAt.toLocaleString(dateLocale),
                }),
              })
            } else {
              addToast({
                type: 'system',
                title: t('chat.scheduleFailed'),
                body: result.error || t('common.unknownError'),
              })
            }
          }
          setShowSchedulePicker(false)
        }}
      />
    </div>
  )
}
