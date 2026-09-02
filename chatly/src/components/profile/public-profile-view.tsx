'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  CalendarDays,
  Cake,
  Check,
  Clock3,
  Edit3,
  MessageSquare,
  Globe2,
  Phone,
  UserMinus,
  UserPlus,
  X,
} from 'lucide-react'
import { FaFacebookF, FaGithub, FaInstagram, FaLinkedinIn, FaYoutube } from 'react-icons/fa6'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createConversation } from '@/lib/actions/conversations'
import {
  removeFriendship,
  respondFriendRequest,
  sendFriendRequest,
} from '@/lib/actions/friendships'
import type { PublicProfileDetails } from '@/lib/actions/profile'
import { useI18n } from '@/lib/i18n'
import { useFriendshipStore } from '@/stores/friendship-store'
import type { Tables } from '@/types'

interface PublicProfileViewProps {
  currentUserId: string
  profile: PublicProfileDetails
  initialFriendship: Tables<'friendships'> | null
}

export function PublicProfileView({
  currentUserId,
  profile,
  initialFriendship,
}: PublicProfileViewProps) {
  const { dateLocale, t } = useI18n()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const friendshipRevision = useFriendshipStore((state) => state.revision)
  const isSelf = currentUserId === profile.id
  const isIncoming = initialFriendship?.addressee_id === currentUserId

  useEffect(() => {
    if (friendshipRevision > 0) router.refresh()
  }, [friendshipRevision, router])

  const runAction = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      router.refresh()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t('common.unknownError'))
    } finally {
      setBusy(false)
    }
  }

  const startChat = async () => {
    setBusy(true)
    setError(null)
    try {
      const conversation = await createConversation(profile.id)
      router.push(`/chats/${conversation.id}`)
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : t('common.unknownError'))
      setBusy(false)
    }
  }

  const renderActions = () => {
    if (isSelf) {
      return (
        <Button onClick={() => router.push('/settings/profile')}>
          <Edit3 className="h-4 w-4" />
          {t('publicProfile.edit')}
        </Button>
      )
    }

    if (initialFriendship?.status === 'accepted') {
      return (
        <>
          <Button onClick={() => void startChat()} disabled={busy}>
            <MessageSquare className="h-4 w-4" />
            {t('friends.message')}
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              confirm(t('friends.removeConfirm', { name: profile.display_name })) &&
              void runAction(() => removeFriendship(initialFriendship.id))
            }
            disabled={busy}
          >
            <UserMinus className="h-4 w-4" />
            {t('friends.remove')}
          </Button>
        </>
      )
    }

    if (initialFriendship?.status === 'pending' && isIncoming) {
      return (
        <>
          <Button
            onClick={() => void runAction(() => respondFriendRequest(initialFriendship.id, true))}
            disabled={busy}
          >
            <Check className="h-4 w-4" />
            {t('friends.accept')}
          </Button>
          <Button
            variant="outline"
            onClick={() => void runAction(() => respondFriendRequest(initialFriendship.id, false))}
            disabled={busy}
          >
            <X className="h-4 w-4" />
            {t('friends.decline')}
          </Button>
        </>
      )
    }

    if (initialFriendship?.status === 'pending') {
      return (
        <Button
          variant="outline"
          onClick={() => void runAction(() => removeFriendship(initialFriendship.id))}
          disabled={busy}
        >
          <Clock3 className="h-4 w-4" />
          {t('friends.cancel')}
        </Button>
      )
    }

    return (
      <Button onClick={() => void runAction(() => sendFriendRequest(profile.id))} disabled={busy}>
        <UserPlus className="h-4 w-4" />
        {t('friends.add')}
      </Button>
    )
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto bg-[var(--bg-app)]">
      <header className="flex items-center gap-3 border-b border-[var(--border-default)] bg-[var(--bg-panel)] p-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          aria-label={t('common.back')}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          {t('publicProfile.title')}
        </h1>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col p-4 sm:p-8">
        <section className="rounded-2xl bg-[var(--bg-panel)] p-6 shadow-sm sm:p-8">
          <div className="flex flex-col items-center text-center">
            <Avatar user={profile} size="2xl" showStatus />
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <h2 className="text-2xl font-bold text-[var(--text-primary)]">
                {profile.display_name}
              </h2>
              {initialFriendship?.status === 'accepted' && (
                <Badge variant="secondary">{t('publicProfile.friend')}</Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-[var(--text-muted)]">@{profile.username}</p>
            <p className="mt-4 max-w-lg text-sm leading-6 text-[var(--text-secondary)]">
              {profile.bio || t('publicProfile.noBio')}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">{renderActions()}</div>
            {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
          </div>

          <div className="mt-8 grid gap-3 border-t border-[var(--border-default)] pt-6 sm:grid-cols-2">
            {profile.phone && (
              <ProfileFact icon={Phone} label={t('profile.phone')} value={profile.phone} />
            )}
            {profile.birth_date && (
              <ProfileFact
                icon={Cake}
                label={t('profile.birthDate')}
                value={new Date(profile.birth_date).toLocaleDateString(dateLocale)}
              />
            )}
            <div className="flex items-center gap-3 rounded-xl bg-[var(--bg-app)] p-4">
              <CalendarDays className="text-primary-500 h-5 w-5" />
              <div>
                <p className="text-xs text-[var(--text-muted)]">{t('publicProfile.memberSince')}</p>
                <p className="text-sm text-[var(--text-primary)]">
                  {profile.created_at
                    ? new Date(profile.created_at).toLocaleDateString(dateLocale)
                    : t('profile.notSet')}
                </p>
              </div>
            </div>
          </div>

          {!!profile.social_links.length && (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {profile.social_links.map((link) => {
                const Icon = getSocialIcon(link)
                return (
                  <a
                    key={link}
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-full border border-[var(--border-default)] px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                  >
                    <Icon className="h-4 w-4" />
                    {getSocialLabel(link)}
                  </a>
                )
              })}
            </div>
          )}
        </section>

        {!isSelf && (
          <Link
            href="/contacts"
            className="text-primary-500 mt-5 self-center text-sm hover:underline"
          >
            {t('publicProfile.backToFriends')}
          </Link>
        )}
      </main>
    </div>
  )
}

function ProfileFact({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-[var(--bg-app)] p-4">
      <Icon className="text-primary-500 h-5 w-5" />
      <div className="min-w-0">
        <p className="text-xs text-[var(--text-muted)]">{label}</p>
        <p className="truncate text-sm text-[var(--text-primary)]">{value}</p>
      </div>
    </div>
  )
}

function getSocialIcon(link: string) {
  const host = getSocialLabel(link).toLowerCase()
  if (host.includes('facebook')) return FaFacebookF
  if (host.includes('instagram')) return FaInstagram
  if (host.includes('linkedin')) return FaLinkedinIn
  if (host.includes('youtube') || host.includes('youtu.be')) return FaYoutube
  if (host.includes('github')) return FaGithub
  return Globe2
}

function getSocialLabel(link: string) {
  try {
    return new URL(link).hostname.replace(/^www\./, '')
  } catch {
    return link
  }
}
