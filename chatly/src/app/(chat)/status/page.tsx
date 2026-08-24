'use client'

import { useState } from 'react'
import { Plus, Eye } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { mockStatuses, getRecentStatuses, getSeenStatuses } from '@/lib/mock/status'
import { currentUser } from '@/lib/mock/users'

function formatStatusTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 60) {
    return `${diffMins}m ago`
  } else if (diffHours < 24) {
    return `${diffHours}h ago`
  } else {
    return `${diffDays}d ago`
  }
}

export default function StatusPage() {
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null)
  const recentStatuses = getRecentStatuses()
  const seenStatuses = getSeenStatuses()

  const selected = selectedStatus ? mockStatuses.find((s) => s.id === selectedStatus) : null

  if (selected) {
    return (
      <div className="flex h-full flex-1 flex-col bg-black">
        {/* Status viewer */}
        <div className="relative h-full">
          <img src={selected.media_url} alt="Status" className="h-full w-full object-cover" />
          {/* Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 to-transparent">
            {/* Header */}
            <div className="flex items-center gap-3 p-4 text-white">
              <Avatar user={selected.user} size="md" showStatus />
              <div>
                <p className="font-medium">{selected.user.display_name}</p>
                <p className="text-xs text-white/70">{formatStatusTime(selected.created_at)}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto text-white hover:bg-white/20"
                onClick={() => setSelectedStatus(null)}
              >
                <span className="text-2xl">&times;</span>
              </Button>
            </div>

            {/* Caption */}
            {selected.caption && (
              <div className="absolute right-4 bottom-20 left-4">
                <p className="text-white">{selected.caption}</p>
              </div>
            )}

            {/* Footer */}
            <div className="absolute right-4 bottom-4 left-4">
              <div className="flex items-center justify-between rounded-xl bg-white/20 p-3 backdrop-blur-sm">
                <input
                  type="text"
                  placeholder="Reply..."
                  className="flex-1 bg-transparent text-white placeholder:text-white/60 focus:outline-none"
                />
                <Button variant="ghost" size="icon" className="text-white">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-1 flex-col bg-[var(--bg-app)]">
      {/* Header */}
      <div className="border-b border-[var(--border-default)] bg-[var(--bg-panel)] p-4">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Status</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">View updates from your contacts</p>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {/* My status */}
          <div className="mb-6 flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-[var(--bg-hover)]">
            <div className="relative">
              <Avatar user={currentUser} size="lg" />
              <button className="bg-primary-500 absolute right-0 bottom-0 flex h-6 w-6 items-center justify-center rounded-full text-white ring-2 ring-[var(--bg-panel)]">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <div>
              <p className="font-medium text-[var(--text-primary)]">My Status</p>
              <p className="text-sm text-[var(--text-muted)]">Tap to add status update</p>
            </div>
          </div>

          <Separator className="mb-4" />

          {/* Recent updates */}
          {recentStatuses.length > 0 && (
            <>
              <div className="mb-2">
                <h3 className="text-sm font-medium text-[var(--text-muted)]">Recent updates</h3>
              </div>
              <div className="space-y-2">
                {recentStatuses.map((status) => (
                  <div
                    key={status.id}
                    className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-[var(--bg-hover)]"
                    onClick={() => setSelectedStatus(status.id)}
                  >
                    <div className="ring-primary-500 rounded-full ring-2">
                      <Avatar user={status.user} size="lg" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-[var(--text-primary)]">
                        {status.user.display_name}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {formatStatusTime(status.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <Separator className="my-4" />
            </>
          )}

          {/* Seen updates */}
          {seenStatuses.length > 0 && (
            <>
              <div className="mb-2">
                <h3 className="text-sm font-medium text-[var(--text-muted)]">Viewed updates</h3>
              </div>
              <div className="space-y-2">
                {seenStatuses.map((status) => (
                  <div
                    key={status.id}
                    className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-[var(--bg-hover)]"
                    onClick={() => setSelectedStatus(status.id)}
                  >
                    <div className="rounded-full opacity-60">
                      <Avatar user={status.user} size="lg" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-[var(--text-primary)] opacity-60">
                        {status.user.display_name}
                      </p>
                      <p className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                        <Eye className="h-3 w-3" />
                        {formatStatusTime(status.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Empty state */}
          {recentStatuses.length === 0 && seenStatuses.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--text-muted)]">
              <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--bg-hover)]">
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <p className="text-sm">No status updates yet</p>
              <p className="mt-1 text-xs">Status updates from your contacts will appear here</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
