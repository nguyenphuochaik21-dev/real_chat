'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Phone,
  Video,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  MessageSquare,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useCallHistoryFiltered } from '@/hooks/use-call-history'
import { formatCallDuration } from '@/stores/call-store'
import { useI18n } from '@/lib/i18n'

type CallFilter = 'all' | 'missed' | 'incoming' | 'outgoing'

function CallIcon({ direction, status }: { direction: string; status?: string }) {
  if (status === 'missed' || status === 'declined') {
    return <PhoneMissed className="h-4 w-4 text-red-500" />
  }
  if (direction === 'incoming') {
    return <PhoneIncoming className="h-4 w-4 text-green-500" />
  }
  return <PhoneOutgoing className="h-4 w-4 text-blue-500" />
}

function formatCallTime(dateStr: string | null, dateLocale: string, yesterday: string): string {
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

function formatCallDate(dateStr: string | null, dateLocale: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleDateString(dateLocale, { weekday: 'long', month: 'long', day: 'numeric' })
}

// Group calls by date
function groupCallsByDate(
  calls: ReturnType<typeof useCallHistoryFiltered>['calls'],
  dateLocale: string
) {
  const groups: { date: string; calls: typeof calls }[] = []
  const dateMap = new Map<string, typeof calls>()

  calls.forEach((call) => {
    const dateKey = new Date(call.started_at).toDateString()
    if (!dateMap.has(dateKey)) {
      dateMap.set(dateKey, [])
    }
    dateMap.get(dateKey)!.push(call)
  })

  dateMap.forEach((groupCalls, dateKey) => {
    groups.push({
      date: formatCallDate(dateKey, dateLocale),
      calls: groupCalls,
    })
  })

  return groups
}

export default function CallsPage() {
  const { t, dateLocale } = useI18n()
  const [filter, setFilter] = useState<CallFilter>('all')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // Get current user
  useEffect(() => {
    const getCurrentUser = async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      setCurrentUserId(user?.id || null)
    }
    getCurrentUser()
  }, [])

  const { calls, loading, error, refresh } = useCallHistoryFiltered(currentUserId || '', filter)
  const groupedCalls = groupCallsByDate(calls, dateLocale)

  const filters: { key: CallFilter; label: string }[] = [
    { key: 'all', label: t('calls.all') },
    { key: 'missed', label: t('calls.missed') },
    { key: 'incoming', label: t('calls.incoming') },
    { key: 'outgoing', label: t('calls.outgoing') },
  ]

  return (
    <div className="flex h-full flex-1 flex-col bg-[var(--bg-app)]">
      {/* Header */}
      <div className="border-b border-[var(--border-default)] bg-[var(--bg-panel)] p-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">{t('calls.title')}</h1>
          <Button variant="ghost" size="icon" onClick={refresh} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                filter === f.key
                  ? 'text-primary-500 bg-[var(--bg-active)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Calls list */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="border-primary-500 h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
              <Phone className="mb-3 h-12 w-12 opacity-50" />
              <p className="text-sm text-red-500">{error}</p>
              <Button variant="ghost" size="sm" onClick={refresh} className="mt-2">
                {t('calls.retry')}
              </Button>
            </div>
          ) : groupedCalls.length > 0 ? (
            groupedCalls.map((group) => (
              <div key={group.date}>
                {/* Date separator */}
                <div className="mb-2 text-xs font-medium text-[var(--text-muted)]">
                  {group.date}
                </div>

                {group.calls.map((call) => (
                  <div key={call.id}>
                    <div className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-[var(--bg-hover)]">
                      <Avatar
                        user={
                          call.other_user ?? {
                            id: call.direction === 'outgoing' ? call.callee_id : call.caller_id,
                            display_name: t('calls.unknownUser'),
                            avatar_url: null,
                          }
                        }
                        size="md"
                        showStatus
                      />

                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p
                            className={cn(
                              'font-medium',
                              call.status === 'missed' || call.status === 'declined'
                                ? 'text-red-500'
                                : 'text-[var(--text-primary)]'
                            )}
                          >
                            {call.other_user?.display_name || t('calls.unknownUser')}
                          </p>
                          <CallIcon direction={call.direction} status={call.status} />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                          <span>
                            {formatCallTime(call.started_at, dateLocale, t('calls.yesterday'))}
                          </span>
                          {call.duration_seconds > 0 && (
                            <>
                              <span>•</span>
                              <span>{formatCallDuration(call.duration_seconds)}</span>
                            </>
                          )}
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            {call.call_type === 'video' ? (
                              <Video className="h-3 w-3" />
                            ) : (
                              <Phone className="h-3 w-3" />
                            )}
                            {t(`calls.${call.call_type}`)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {call.conversation_id && (
                          <Link href={`/chats/${call.conversation_id}`}>
                            <Button variant="ghost" size="icon-sm">
                              <MessageSquare className="h-4 w-4" />
                            </Button>
                          </Link>
                        )}
                        <Button variant="ghost" size="icon-sm">
                          {call.call_type === 'video' ? (
                            <Video className="h-4 w-4" />
                          ) : (
                            <Phone className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                    <Separator className="my-1" />
                  </div>
                ))}
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
              <Phone className="mb-3 h-12 w-12 opacity-50" />
              <p className="text-sm">{t('calls.none')}</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
