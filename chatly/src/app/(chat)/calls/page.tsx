'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Phone,
  Video,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  MessageSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { mockCalls, formatCallDuration } from '@/lib/mock/calls'
import type { MockCall } from '@/lib/mock/types'

type CallFilter = 'all' | 'missed' | 'incoming' | 'outgoing'

function CallIcon({ direction }: { direction: MockCall['direction']; type: MockCall['type'] }) {
  if (direction === 'missed') {
    return <PhoneMissed className="h-4 w-4 text-red-500" />
  }
  if (direction === 'incoming') {
    return <PhoneIncoming className="h-4 w-4 text-green-500" />
  }
  return <PhoneOutgoing className="h-4 w-4 text-blue-500" />
}

function formatCallTime(dateStr: string): string {
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

export default function CallsPage() {
  const [filter, setFilter] = useState<CallFilter>('all')

  const filteredCalls = mockCalls.filter((call) => {
    if (filter === 'all') return true
    if (filter === 'missed') return call.direction === 'missed'
    if (filter === 'incoming') return call.direction === 'incoming'
    if (filter === 'outgoing') return call.direction === 'outgoing'
    return true
  })

  const filters: { key: CallFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'missed', label: 'Missed' },
    { key: 'incoming', label: 'Incoming' },
    { key: 'outgoing', label: 'Outgoing' },
  ]

  return (
    <div className="flex h-full flex-1 flex-col bg-[var(--bg-app)]">
      {/* Header */}
      <div className="border-b border-[var(--border-default)] bg-[var(--bg-panel)] p-4">
        <h1 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">Calls</h1>

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
          {filteredCalls.length > 0 ? (
            filteredCalls.map((call) => (
              <div key={call.id}>
                <div className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-[var(--bg-hover)]">
                  <Avatar user={call.participant} size="md" showStatus />

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-[var(--text-primary)]">
                        {call.participant.display_name}
                      </p>
                      <CallIcon direction={call.direction} type={call.type} />
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                      <span>{formatCallTime(call.started_at)}</span>
                      {call.duration_seconds && (
                        <>
                          <span>•</span>
                          <span>{formatCallDuration(call.duration_seconds)}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Link href={`/chats/${call.participant.id}`}>
                      <Button variant="ghost" size="icon-sm">
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button variant="ghost" size="icon-sm">
                      {call.type === 'video' ? (
                        <Video className="h-4 w-4" />
                      ) : (
                        <Phone className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <Separator className="my-1" />
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
              <Phone className="mb-3 h-12 w-12 opacity-50" />
              <p className="text-sm">No calls found</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
