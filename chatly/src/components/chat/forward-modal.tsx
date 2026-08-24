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

interface ForwardModalProps {
  currentUserId: string
  onForwardComplete?: () => void
}

export function ForwardModal({ currentUserId, onForwardComplete }: ForwardModalProps) {
  const { forwardModalOpen, messagesToForward, closeForwardModal } = useMessageActionsStore()
  const { conversations, loading } = useConversations(currentUserId)
  const addToast = useNotificationStore((state) => state.addToast)

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedConversations, setSelectedConversations] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)

  // Reset state when modal opens
  useEffect(() => {
    if (forwardModalOpen) {
      setSearchQuery('')
      setSelectedConversations(new Set())
    }
  }, [forwardModalOpen])

  if (!forwardModalOpen) return null

  const filteredConversations = conversations.filter(
    (conv) =>
      conv.participant?.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
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
        const result = await forwardMessage(
          message.id,
          Array.from(selectedConversations)
        )

        if (!result.success) {
          addToast({
            type: 'system',
            title: 'Forward failed',
            body: result.error || 'Unknown error',
          })
        }
      }

      addToast({
        type: 'system',
        title: 'Messages forwarded',
        body: `Sent to ${selectedConversations.size} conversation${selectedConversations.size > 1 ? 's' : ''}`,
      })

      onForwardComplete?.()
      closeForwardModal()
    } catch (err) {
      addToast({
        type: 'system',
        title: 'Forward failed',
        body: err instanceof Error ? err.message : 'Unknown error',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={closeForwardModal}
      />

      {/* Modal */}
      <div
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2',
          'rounded-2xl border border-[var(--border-default)]',
          'bg-[var(--bg-panel)] shadow-2xl animate-fade-in'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-default)] px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Forward to
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              {messagesToForward.length} message{messagesToForward.length > 1 ? 's' : ''} selected
            </p>
          </div>
          <button
            onClick={closeForwardModal}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-[var(--border-default)] px-4 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              type="text"
              placeholder="Search conversations..."
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
              No conversations found
            </div>
          ) : (
            <div className="py-2">
              {filteredConversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => toggleConversation(conv.id)}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2 transition-colors',
                    'hover:bg-[var(--bg-hover)]',
                    selectedConversations.has(conv.id) && 'bg-primary-500/10'
                  )}
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
                    {selectedConversations.has(conv.id) && (
                      <span className="text-white">✓</span>
                    )}
                  </div>

                  {/* Avatar */}
                  <Avatar
                    user={conv.participant}
                    size="md"
                    showStatus
                  />

                  {/* Name */}
                  <div className="flex-1 text-left">
                    <p className="font-medium text-[var(--text-primary)]">
                      {conv.participant?.display_name || 'Unknown'}
                    </p>
                  </div>
                </button>
              ))}
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
                <span>
                  Send to {selectedConversations.size} conversation{selectedConversations.size > 1 ? 's' : ''}
                </span>
              </>
            )}
          </Button>
        </div>
      </div>
    </>
  )
}
