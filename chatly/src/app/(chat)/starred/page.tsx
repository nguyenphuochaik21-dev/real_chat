'use client'

import Link from 'next/link'
import { Star, MessageSquare, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useStarredMessages } from '@/hooks/use-starred-messages'
import { useAuth } from '@/hooks/use-auth'
import { formatDistanceToNow } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { Tables } from '@/types'
import { useI18n } from '@/lib/i18n'

type Message = Tables<'messages'>

export default function StarredMessagesPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const { starredMessages, loading, toggleStarMessage } = useStarredMessages(user?.id || null)

  if (!user) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-[var(--bg-app)]">
        <p className="text-[var(--text-muted)]">{t('starred.signIn')}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-1 flex-col bg-[var(--bg-app)]">
      {/* Header */}
      <div className="border-b border-[var(--border-default)] bg-[var(--bg-panel)] p-4">
        <div className="flex items-center gap-3">
          <Link href="/chats">
            <Button variant="ghost" size="icon-sm">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <Star className="h-6 w-6 fill-yellow-400 text-yellow-400" />
          <div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">
              {t('starred.title')}
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              {t('starred.count', { count: starredMessages.length })}
            </p>
          </div>
        </div>
      </div>

      {/* Messages list */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="border-primary-500 h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
            </div>
          ) : starredMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Star className="mb-3 h-12 w-12 text-[var(--text-muted)] opacity-50" />
              <p className="text-sm font-medium text-[var(--text-secondary)]">
                {t('starred.none')}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">{t('starred.noneHint')}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {starredMessages.map((message) => (
                <StarredMessageCard
                  key={message.id}
                  message={message}
                  onUnstar={() => toggleStarMessage(message.id)}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

interface StarredMessageCardProps {
  message: Message & { conversation_title?: string }
  onUnstar: () => void
}

function StarredMessageCard({ message, onUnstar }: StarredMessageCardProps) {
  const { locale, t } = useI18n()
  const createdAt = message.created_at ? new Date(message.created_at) : new Date()

  return (
    <div
      className={cn(
        'group rounded-xl border border-[var(--border-default)]',
        'bg-[var(--bg-panel)] p-4 transition-colors',
        'hover:bg-[var(--bg-hover)]'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {/* Conversation indicator */}
          {message.conversation_title && (
            <div className="mb-2 flex items-center gap-1 text-xs text-[var(--text-muted)]">
              <MessageSquare className="h-3 w-3" />
              <span>{message.conversation_title}</span>
            </div>
          )}

          {/* Message content */}
          <p className="line-clamp-3 text-sm text-[var(--text-primary)]">
            {message.content || t('starred.media')}
          </p>

          {/* Timestamp */}
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            {formatDistanceToNow(createdAt, locale)}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Link href={`/chats/${message.conversation_id}`}>
            <Button variant="ghost" size="icon-sm" title={t('starred.open')}>
              <MessageSquare className="h-4 w-4" />
            </Button>
          </Link>
          <Button variant="ghost" size="icon-sm" onClick={onUnstar} title={t('starred.unstar')}>
            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
          </Button>
        </div>
      </div>
    </div>
  )
}
