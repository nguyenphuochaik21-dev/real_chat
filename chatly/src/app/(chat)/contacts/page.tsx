'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Clock3, MessageSquare, Search, UserMinus, UserPlus, Users, X } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { createConversation } from '@/lib/actions/conversations'
import {
  getFriendshipOverview,
  removeFriendship,
  respondFriendRequest,
  sendFriendRequest,
  type FriendProfile,
  type FriendshipItem,
  type FriendshipOverview,
} from '@/lib/actions/friendships'
import { useI18n } from '@/lib/i18n'
import { useFriendshipStore } from '@/stores/friendship-store'

function matchesSearch(profile: FriendProfile, search: string) {
  const query = search.trim().toLocaleLowerCase()
  if (!query) return true
  return `${profile.display_name} ${profile.username}`.toLocaleLowerCase().includes(query)
}

function ProfileIdentity({ profile }: { profile: FriendProfile }) {
  return (
    <Link href={`/profile/${profile.id}`} className="flex min-w-0 flex-1 items-center gap-3">
      <Avatar user={profile} size="md" showStatus />
      <div className="min-w-0">
        <p className="truncate font-medium text-[var(--text-primary)]">{profile.display_name}</p>
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
    <div className="flex items-center gap-3 rounded-xl bg-[var(--bg-panel)] p-3 shadow-sm">
      <ProfileIdentity profile={profile} />
      <div className="flex shrink-0 items-center gap-1">{children}</div>
    </div>
  )
}

export default function ContactsPage() {
  const { t } = useI18n()
  const router = useRouter()
  const friendshipRevision = useFriendshipStore((state) => state.revision)
  const [overview, setOverview] = useState<FriendshipOverview | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const nextOverview = await getFriendshipOverview()
      setOverview(nextOverview)
      setError(null)
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : t('common.unknownError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void refresh(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [refresh])

  useEffect(() => {
    if (friendshipRevision <= 0) return
    const timeoutId = window.setTimeout(() => void refresh(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [friendshipRevision, refresh])

  const runAction = async (id: string, action: () => Promise<void>) => {
    setBusyId(id)
    setError(null)
    try {
      await action()
      await refresh()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t('common.unknownError'))
    } finally {
      setBusyId(null)
    }
  }

  const startChat = async (profileId: string) => {
    if (!overview) return
    setBusyId(profileId)
    try {
      const conversation = await createConversation(profileId)
      router.push(`/chats/${conversation.id}`)
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : t('common.unknownError'))
      setBusyId(null)
    }
  }

  const filtered = useMemo(() => {
    if (!overview) return null
    return {
      friends: overview.friends.filter((item) => matchesSearch(item.profile, search)),
      incoming: overview.incoming.filter((item) => matchesSearch(item.profile, search)),
      outgoing: overview.outgoing.filter((item) => matchesSearch(item.profile, search)),
      discover: overview.discover.filter((profile) => matchesSearch(profile, search)),
    }
  }, [overview, search])

  if (loading) {
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
            onChange={(event) => setSearch(event.target.value)}
            className="pl-10"
          />
        </div>
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      </header>

      <ScrollArea className="flex-1">
        <div className="mx-auto w-full max-w-4xl space-y-7 p-4 sm:p-6">
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
                        void runAction(item.id, () => respondFriendRequest(item.id, true))
                      }
                      disabled={busyId === item.id}
                      aria-label={t('friends.accept')}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() =>
                        void runAction(item.id, () => respondFriendRequest(item.id, false))
                      }
                      disabled={busyId === item.id}
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
                {filtered.friends.map((item) => (
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
                          void runAction(item.id, () => removeFriendship(item.id))
                        }
                      }}
                      disabled={busyId === item.id}
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
                      onClick={() => void runAction(item.id, () => removeFriendship(item.id))}
                      disabled={busyId === item.id}
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
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void runAction(profile.id, () => sendFriendRequest(profile.id))
                      }
                      disabled={busyId === profile.id}
                    >
                      <UserPlus className="h-4 w-4" />
                      <span className="hidden sm:inline">{t('friends.add')}</span>
                    </Button>
                  </ContactRow>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">{t('friends.noSuggestions')}</p>
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  )
}
