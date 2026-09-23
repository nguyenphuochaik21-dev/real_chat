'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Clock3, MessageSquare, Search, UserMinus, UserPlus, Users, X } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { VerifiedBadge } from '@/components/ui/verified-badge'
import { openDirectConversation } from '@/lib/actions/conversations'
import {
  getFriendshipOverview,
  removeFriendship,
  respondFriendRequest,
  sendFriendRequest,
  searchFriendCandidates,
  type FriendProfile,
  type FriendshipItem,
  type FriendshipOverview,
} from '@/lib/actions/friendships'
import { useI18n } from '@/lib/i18n'
import { useFriendshipStore } from '@/stores/friendship-store'
import { useNotificationStore } from '@/stores/notification-store'

const FRIEND_CACHE_STALE_MS = 60_000
const FRIEND_PAGE_SIZE = 20

function matchesSearch(profile: FriendProfile, search: string) {
  const query = search.trim().toLocaleLowerCase()
  if (!query) return true
  return `${profile.display_name} ${profile.username}`.toLocaleLowerCase().includes(query)
}

function ProfileIdentity({ profile }: { profile: FriendProfile }) {
  const { t } = useI18n()
  return (
    <Link
      href={`/profile/${profile.id}`}
      className="flex min-w-0 items-center gap-3 overflow-hidden"
    >
      <Avatar user={profile} size="md" showStatus className="shrink-0" />
      <div className="min-w-0 flex-1 overflow-hidden">
        <p className="flex min-w-0 items-center gap-1 font-medium text-[var(--text-primary)]">
          <span className="truncate">{profile.display_name}</span>
          {profile.is_verified && <VerifiedBadge label={t('verified.label')} />}
        </p>
        <p className="truncate text-xs text-[var(--text-muted)]">
          @{profile.username}
          {profile.bio ? ` · ${profile.bio}` : ''}
        </p>
      </div>
    </Link>
  )
}

interface ContactRowProps {
  profile: FriendProfile
  children: React.ReactNode
}

function ContactRow({ profile, children }: ContactRowProps) {
  return (
    <div className="list-render-row grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 overflow-hidden rounded-xl bg-[var(--bg-panel)] p-3 shadow-sm sm:gap-3">
      <ProfileIdentity profile={profile} />
      <div className="flex min-w-0 items-center gap-1">{children}</div>
    </div>
  )
}

export default function ContactsPage() {
  const { t } = useI18n()
  const router = useRouter()
  const friendshipRevision = useFriendshipStore((state) => state.revision)
  const cachedOverview = useFriendshipStore((state) => state.overview)
  const overviewFetchedAt = useFriendshipStore((state) => state.overviewFetchedAt)
  const setCachedOverview = useFriendshipStore((state) => state.setOverview)
  const addToast = useNotificationStore((state) => state.addToast)
  const overview = cachedOverview
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<FriendProfile[]>([])
  const [searching, setSearching] = useState(false)
  const [visibleFriendCount, setVisibleFriendCount] = useState(FRIEND_PAGE_SIZE)
  const [loading, setLoading] = useState(!cachedOverview)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const handledRevisionRef = useRef(friendshipRevision)

  const refresh = useCallback(async () => {
    try {
      const result = await getFriendshipOverview()
      if (result.error !== undefined) {
        setError(result.error)
        return
      }
      const nextOverview = result.data
      setCachedOverview(nextOverview)
      setError(null)
    } catch {
      setError(t('common.unknownError'))
    } finally {
      setLoading(false)
    }
  }, [setCachedOverview, t])

  useEffect(() => {
    if (overview && Date.now() - overviewFetchedAt < FRIEND_CACHE_STALE_MS) return
    const timeoutId = window.setTimeout(() => void refresh(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [overview, overviewFetchedAt, refresh])

  useEffect(() => {
    if (friendshipRevision === handledRevisionRef.current) return
    handledRevisionRef.current = friendshipRevision
    const timeoutId = window.setTimeout(() => void refresh(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [friendshipRevision, refresh])

  useEffect(() => {
    if (search.trim().length < 2) return
    let active = true
    const timeoutId = window.setTimeout(() => {
      void searchFriendCandidates(search)
        .then((profiles) => {
          if (active) setSearchResults(profiles)
        })
        .catch(() => {
          if (active) setSearchResults([])
        })
        .finally(() => {
          if (active) setSearching(false)
        })
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timeoutId)
    }
  }, [search])

  const runAction = async (
    id: string,
    action: () => Promise<{ error: string | null }>,
    optimistic: (current: FriendshipOverview) => FriendshipOverview,
    successMessage: string
  ) => {
    if (busyId || !overview) return
    const previous = overview
    setBusyId(id)
    setError(null)
    const optimisticOverview = optimistic(previous)
    setCachedOverview(optimisticOverview)
    try {
      const result = await action()
      if (result.error) {
        setError(result.error)
        setCachedOverview(previous)
        return
      }
      addToast({ type: 'system', title: successMessage, body: '' })
      await refresh()
    } catch {
      setError(t('common.unknownError'))
      setCachedOverview(previous)
    } finally {
      setBusyId(null)
    }
  }

  const startChat = async (profileId: string) => {
    if (!overview) return
    setBusyId(profileId)
    try {
      const result = await openDirectConversation(profileId)
      if (result.error !== undefined) {
        setError(result.error)
        setBusyId(null)
        return
      }
      router.push(`/chats/${result.data.id}`)
    } catch {
      setError('Không thể mở cuộc trò chuyện. Vui lòng thử lại.')
      setBusyId(null)
    }
  }

  const filtered = useMemo(() => {
    if (!overview) return null
    return {
      friends: overview.friends.filter((item) => matchesSearch(item.profile, search)),
      incoming: overview.incoming.filter((item) => matchesSearch(item.profile, search)),
      outgoing: overview.outgoing.filter((item) => matchesSearch(item.profile, search)),
      discover: (search.trim().length >= 2
        ? searching
          ? []
          : searchResults
        : overview.discover
      ).filter(
        (profile) =>
          matchesSearch(profile, search) &&
          !overview.friends.some((item) => item.profile.id === profile.id) &&
          !overview.incoming.some((item) => item.profile.id === profile.id) &&
          !overview.outgoing.some((item) => item.profile.id === profile.id)
      ),
    }
  }, [overview, search, searchResults, searching])

  if (loading && !overview) {
    return (
      <div className="flex h-full flex-1 items-center justify-center bg-[var(--bg-app)]">
        <div className="border-primary-500 h-8 w-8 animate-spin rounded-full border-3 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-[var(--bg-app)]">
      <header className="border-b border-[var(--border-default)] bg-[var(--bg-panel)] p-4">
        <div className="mb-4 flex items-center gap-3">
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">{t('friends.title')}</h1>
          {!!overview?.incoming.length && (
            <Badge variant="primary" size="sm">
              {overview.incoming.length}
            </Badge>
          )}
        </div>
        <div className="relative">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            type="search"
            placeholder={t('friends.search')}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setSearching(event.target.value.trim().length >= 2)
              setVisibleFriendCount(FRIEND_PAGE_SIZE)
            }}
            className="pl-10"
          />
        </div>
        {error && (
          <div role="alert" className="mt-3 text-sm text-red-500">
            {error}
            <button className="ml-2 underline" onClick={() => void refresh()}>
              Thử lại
            </button>
          </div>
        )}
      </header>

      <ScrollArea className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-4xl min-w-0 space-y-7 p-4 sm:p-6">
          {!!filtered?.incoming.length && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
                <UserPlus className="h-4 w-4" />
                {t('friends.incoming')}
              </h2>
              <div className="grid gap-2 lg:grid-cols-2">
                {filtered.incoming.map((item) => (
                  <ContactRow key={item.id} profile={item.profile}>
                    <Button
                      size="icon-sm"
                      onClick={() =>
                        void runAction(
                          item.id,
                          () => respondFriendRequest(item.id, true),
                          (current) => ({
                            ...current,
                            incoming: current.incoming.filter((entry) => entry.id !== item.id),
                            friends: [...current.friends, { ...item, status: 'accepted' }],
                          }),
                          t('friends.acceptedToast')
                        )
                      }
                      disabled={busyId !== null}
                      aria-label={t('friends.accept')}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() =>
                        void runAction(
                          item.id,
                          () => respondFriendRequest(item.id, false),
                          (current) => ({
                            ...current,
                            incoming: current.incoming.filter((entry) => entry.id !== item.id),
                          }),
                          t('friends.declinedToast')
                        )
                      }
                      disabled={busyId !== null}
                      aria-label={t('friends.decline')}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </ContactRow>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
              <Users className="h-4 w-4" />
              {t('friends.yourFriends')}
            </h2>
            {filtered?.friends.length ? (
              <div className="grid gap-2 lg:grid-cols-2">
                {filtered.friends.slice(0, visibleFriendCount).map((item) => (
                  <ContactRow key={item.id} profile={item.profile}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => void startChat(item.profile.id)}
                      disabled={busyId === item.profile.id}
                      aria-label={t('friends.message')}
                    >
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        if (
                          confirm(t('friends.removeConfirm', { name: item.profile.display_name }))
                        ) {
                          void runAction(
                            item.id,
                            () => removeFriendship(item.id),
                            (current) => ({
                              ...current,
                              friends: current.friends.filter((entry) => entry.id !== item.id),
                            }),
                            t('friends.removedToast')
                          )
                        }
                      }}
                      disabled={busyId !== null}
                      aria-label={t('friends.remove')}
                    >
                      <UserMinus className="h-4 w-4" />
                    </Button>
                  </ContactRow>
                ))}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-[var(--border-default)] p-6 text-center text-sm text-[var(--text-muted)]">
                {t('friends.none')}
              </p>
            )}
            {filtered && filtered.friends.length > visibleFriendCount && (
              <Button
                variant="outline"
                className="mt-3 w-full"
                onClick={() => setVisibleFriendCount((count) => count + FRIEND_PAGE_SIZE)}
              >
                {t('friends.loadMore')}
              </Button>
            )}
          </section>

          {!!filtered?.outgoing.length && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
                <Clock3 className="h-4 w-4" />
                {t('friends.outgoing')}
              </h2>
              <div className="grid gap-2 lg:grid-cols-2">
                {filtered.outgoing.map((item: FriendshipItem) => (
                  <ContactRow key={item.id} profile={item.profile}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void runAction(
                          item.id,
                          () => removeFriendship(item.id),
                          (current) => ({
                            ...current,
                            outgoing: current.outgoing.filter((entry) => entry.id !== item.id),
                          }),
                          t('friends.cancelledToast')
                        )
                      }
                      disabled={busyId !== null || item.id.startsWith('pending-')}
                    >
                      {t('friends.cancel')}
                    </Button>
                  </ContactRow>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
              <UserPlus className="h-4 w-4" />
              {t('friends.discover')}
            </h2>
            {filtered?.discover.length ? (
              <div className="grid gap-2 lg:grid-cols-2">
                {filtered.discover.map((profile) => (
                  <ContactRow key={profile.id} profile={profile}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => void startChat(profile.id)}
                      disabled={busyId === profile.id}
                      aria-label={t('friends.message')}
                    >
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void runAction(
                          profile.id,
                          () => sendFriendRequest(profile.id),
                          (current) => ({
                            ...current,
                            discover: current.discover.filter((entry) => entry.id !== profile.id),
                            outgoing: [
                              ...current.outgoing,
                              {
                                id: `pending-${profile.id}`,
                                requesterId: current.currentUserId,
                                addresseeId: profile.id,
                                status: 'pending',
                                profile,
                              },
                            ],
                          }),
                          t('friends.sentToast')
                        )
                      }
                      disabled={busyId !== null}
                    >
                      <UserPlus className="h-4 w-4" />
                      <span className="hidden sm:inline">{t('friends.add')}</span>
                    </Button>
                  </ContactRow>
                ))}
              </div>
            ) : searching ? (
              <p className="text-sm text-[var(--text-muted)]">{t('common.loading')}</p>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">{t('friends.noSuggestions')}</p>
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  )
}
