'use client'

import { useState, useEffect } from 'react'
import { X, Search, Send, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { forwardMessage } from '@/lib/actions/messages'
import { useConversations } from '@/hooks/use-conversations'
import { useMessageActionsStore } from '@/stores/message-actions-store'
import { useNotificationStore } from '@/stores/notification-store'
import { useI18n } from '@/lib/i18n'

interface ForwardModalProps {
  currentUserId: string
  onForwardComplete?: () => void
}

export function ForwardModal({ currentUserId, onForwardComplete }: ForwardModalProps) {
  const { t } = useI18n()
  const { forwardModalOpen, messagesToForward, closeForwardModal } = useMessageActionsStore()
  const { conversations, loading } = useConversations(currentUserId)
  const addToast = useNotificationStore((state) => state.addToast)

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedConversations, setSelectedConversations] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)

  // Reset state when modal opens
  useEffect(() => {
    if (!forwardModalOpen) return
    const timeoutId = window.setTimeout(() => {
      setSearchQuery('')
      setSelectedConversations(new Set())
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [forwardModalOpen])

  if (!forwardModalOpen) return null

  const getTitle = (conversation: (typeof conversations)[number]) =>
    conversation.type === 'group'
      ? conversation.title || t('group.tab')
      : conversation.participant?.display_name || t('calls.unknownUser')

  const filteredConversations = conversations.filter((conversation) =>
    getTitle(conversation).toLowerCase().includes(searchQuery.toLowerCase())
  )

  const toggleConversation = (conversationId: string) => {
    setSelectedConversations((prev) => {
      const next = new Set(prev)
      if (next.has(conversationId)) {
        next.delete(conversationId)
      } else {
        next.add(conversationId)
      }
      return next
    })
  }

  const handleSend = async () => {
    if (selectedConversations.size === 0) return

    setSending(true)

    try {
      // Forward each message to selected conversations
      for (const message of messagesToForward) {
        const result = await forwardMessage(message.id, Array.from(selectedConversations))

        if (!result.success) {
          addToast({
            type: 'system',
            title: t('forward.failed'),
            body: result.error || t('common.unknownError'),
          })
        }
      }

      addToast({
        type: 'system',
        title: t('forward.success'),
        body: t('forward.successBody', { count: selectedConversations.size }),
      })

      onForwardComplete?.()
      closeForwardModal()
    } catch (err) {
      addToast({
        type: 'system',
        title: t('forward.failed'),
        body: err instanceof Error ? err.message : t('common.unknownError'),
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="forward-modal-title"
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={closeForwardModal}
      />

      {/* Modal */}
      <div
        className={cn(
          'fixed top-1/2 left-1/2 z-50 w-[calc(100%-1rem)] max-w-md -translate-x-1/2 -translate-y-1/2',
          'rounded-2xl border border-[var(--border-default)]',
          'animate-fade-in bg-[var(--bg-panel)] shadow-2xl'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-default)] px-4 py-3">
          <div>
            <h2
              id="forward-modal-title"
              className="text-lg font-semibold text-[var(--text-primary)]"
            >
              {t('forward.title')}
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              {t('forward.selected', { count: messagesToForward.length })}
            </p>
          </div>
          <button
            onClick={closeForwardModal}
            aria-label={t('common.close')}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-[var(--border-default)] px-4 py-2">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              type="text"
              placeholder={t('forward.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Conversation list */}
        <ScrollArea className="max-h-80">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--text-muted)]">
              {t('forward.none')}
            </div>
          ) : (
            <div className="py-2">
              {filteredConversations.map((conv) => {
                const displayName = getTitle(conv)
                const avatarUser =
                  conv.type === 'group'
                    ? { id: conv.id, display_name: displayName, avatar_url: conv.avatar_url }
                    : conv.participant
                return (
                  <button
                    key={conv.id}
                    onClick={() => toggleConversation(conv.id)}
                    className={cn(
                      'flex w-full items-center gap-3 px-4 py-2 transition-colors',
                      'hover:bg-[var(--bg-hover)]',
                      selectedConversations.has(conv.id) && 'bg-primary-500/10'
                    )}
                    aria-pressed={selectedConversations.has(conv.id)}
                  >
                    {/* Checkbox indicator */}
                    <div
                      className={cn(
                        'flex h-5 w-5 items-center justify-center rounded border',
                        selectedConversations.has(conv.id)
                          ? 'border-primary-500 bg-primary-500'
                          : 'border-[var(--border-default)]'
                      )}
                    >
                      {selectedConversations.has(conv.id) && <span className="text-white">✓</span>}
                    </div>

                    {/* Avatar */}
                    <Avatar user={avatarUser!} size="md" showStatus={conv.type === 'direct'} />

                    {/* Name */}
                    <div className="flex-1 text-left">
                      <p className="font-medium text-[var(--text-primary)]">{displayName}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="border-t border-[var(--border-default)] px-4 py-3">
          <Button
            onClick={handleSend}
            disabled={selectedConversations.size === 0 || sending}
            className="w-full"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>{t('forward.send', { count: selectedConversations.size })}</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  )
}
