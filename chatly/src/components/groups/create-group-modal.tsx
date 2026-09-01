'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import { Check, Search, UsersRound, X } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { createGroup } from '@/lib/actions/groups'
import { getFriendshipOverview, type FriendshipItem } from '@/lib/actions/friendships'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface CreateGroupModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: (conversationId: string) => void
}

export function CreateGroupModal({ isOpen, onClose, onCreated }: CreateGroupModalProps) {
  const { t } = useI18n()
  const titleId = useId()
  const [title, setTitle] = useState('')
  const [query, setQuery] = useState('')
  const [friends, setFriends] = useState<FriendshipItem[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    const timeoutId = window.setTimeout(() => {
      setLoading(true)
      setError(null)

      void getFriendshipOverview()
        .then((overview) => {
          if (!cancelled) setFriends(overview.friends)
        })
        .catch((loadError: unknown) => {
          if (!cancelled) {
            setError(
              loadError instanceof Error ? loadError.message : t('group.loadFriendsFailed')
            )
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 0)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [isOpen, t])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, submitting])

  const filteredFriends = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return friends
    return friends.filter(({ profile }) =>
      `${profile.display_name} ${profile.username ?? ''}`.toLowerCase().includes(normalizedQuery)
    )
  }, [friends, query])

  if (!isOpen) return null

  const toggleFriend = (userId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (title.trim().length < 2 || selectedIds.size < 2) return

    setSubmitting(true)
    setError(null)
    try {
      const conversationId = await createGroup(title.trim(), Array.from(selectedIds))
      setTitle('')
      setQuery('')
      setSelectedIds(new Set())
      onCreated(conversationId)
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t('group.createFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose()
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={handleSubmit}
        className="flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-[var(--border-default)] bg-[var(--bg-panel)] shadow-2xl sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--border-default)] p-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-[var(--text-primary)]">
              {t('group.createTitle')}
            </h2>
            <p className="text-sm text-[var(--text-muted)]">{t('group.createHint')}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            disabled={submitting}
            aria-label={t('common.close')}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="space-y-4 p-4">
          <div>
            <label htmlFor="group-name" className="mb-1.5 block text-sm font-medium">
              {t('group.name')}
            </label>
            <Input
              id="group-name"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t('group.namePlaceholder')}
              minLength={2}
              maxLength={80}
              autoFocus
              required
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label htmlFor="group-friend-search" className="text-sm font-medium">
                {t('group.members')}
              </label>
              <span className="text-xs text-[var(--text-muted)]" aria-live="polite">
                {t('group.selectedCount', { count: selectedIds.size })}
              </span>
            </div>
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input
                id="group-friend-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('group.searchFriends')}
                className="pl-9"
              />
            </div>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1 border-y border-[var(--border-default)]">
          <div className="space-y-1 p-2">
            {loading ? (
              <div
                className="flex justify-center py-10"
                role="status"
                aria-label={t('group.loading')}
              >
                <div className="border-primary-500 h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
              </div>
            ) : filteredFriends.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-center text-[var(--text-muted)]">
                <UsersRound className="mb-3 h-10 w-10" />
                <p className="text-sm">{t('group.noFriends')}</p>
              </div>
            ) : (
              filteredFriends.map(({ profile }) => {
                const selected = selectedIds.has(profile.id)
                return (
                  <button
                    key={profile.id}
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    onClick={() => toggleFriend(profile.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors',
                      selected ? 'bg-[var(--bg-active)]' : 'hover:bg-[var(--bg-hover)]'
                    )}
                  >
                    <Avatar user={profile} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-[var(--text-primary)]">
                        {profile.display_name}
                      </p>
                      {profile.username && (
                        <p className="truncate text-xs text-[var(--text-muted)]">
                          @{profile.username}
                        </p>
                      )}
                    </div>
                    <span
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full border',
                        selected
                          ? 'border-primary-500 bg-primary-500 text-white'
                          : 'border-[var(--border-strong)]'
                      )}
                    >
                      {selected && <Check className="h-4 w-4" />}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </ScrollArea>

        <div className="space-y-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {error && (
            <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={submitting || title.trim().length < 2 || selectedIds.size < 2}
            >
              {submitting ? t('group.creating') : t('group.create')}
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
