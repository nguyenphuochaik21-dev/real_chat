'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Bell,
  CalendarDays,
  ExternalLink,
  Globe2,
  Images,
  Pin,
  Search,
  SlidersHorizontal,
  UserRound,
  Phone,
  X,
} from 'lucide-react'
import { FaFacebookF, FaGithub, FaInstagram, FaLinkedinIn, FaYoutube } from 'react-icons/fa6'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { VerifiedBadge } from '@/components/ui/verified-badge'
import type { PublicProfile } from '@/types'
import type { PresenceStatus } from '@/lib/presence'
import { useI18n } from '@/lib/i18n'
import { getPublicProfile, type PublicProfileDetails } from '@/lib/actions/profile'
import { MediaGallery, type MediaItem } from './media-gallery'

interface ConversationProfilePanelProps {
  profile: PublicProfile
  status: PresenceStatus
  mediaItems: MediaItem[]
  mediaTotalCount: number
  isPinned: boolean
  isMuted: boolean
  onOpenMedia: () => void
  onOpenSearch: () => void
  onOpenActions: () => void
  onClose: () => void
}

export function ConversationProfilePanel({
  profile,
  status,
  mediaItems,
  mediaTotalCount,
  isPinned,
  isMuted,
  onOpenMedia,
  onOpenSearch,
  onOpenActions,
  onClose,
}: ConversationProfilePanelProps) {
  const { dateLocale, t } = useI18n()
  const [details, setDetails] = useState<PublicProfileDetails>({
    ...profile,
    phone: null,
    birth_date: null,
    social_links: [],
  })

  useEffect(() => {
    let active = true
    void getPublicProfile(profile.id)
      .then((nextProfile) => {
        if (active && nextProfile) setDetails(nextProfile)
      })
      .catch(() => {
        // Keep the already-rendered public profile summary when enrichment fails.
      })
    return () => {
      active = false
    }
  }, [profile.id])

  return (
    <aside className="absolute inset-y-0 right-0 z-40 w-full overflow-y-auto border-l border-[var(--border-default)] bg-[var(--bg-panel)] shadow-xl sm:w-96">
      <header className="flex items-center justify-between border-b border-[var(--border-default)] p-4">
        <h2 className="font-semibold text-[var(--text-primary)]">{t('publicProfile.title')}</h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t('common.close')}>
          <X className="h-5 w-5" />
        </Button>
      </header>

      <div className="p-5">
        <section className="flex flex-col items-center text-center">
          <Avatar user={details} size="xl" showStatus statusOverride={status} />
          <div className="mt-4 flex max-w-full items-center gap-1.5">
            <h3 className="truncate text-xl font-semibold text-[var(--text-primary)]">
              {details.display_name}
            </h3>
            {details.is_verified && <VerifiedBadge label={t('verified.label')} />}
          </div>
          <p className="mt-1 text-sm text-[var(--text-muted)]">@{details.username}</p>
        </section>

        <section
          className="mt-6 grid grid-cols-4 gap-2"
          aria-label={t('profilePanel.quickActions')}
        >
          <QuickAction
            icon={UserRound}
            label={t('profilePanel.profile')}
            href={`/profile/${profile.id}`}
          />
          <QuickAction icon={Search} label={t('profilePanel.search')} onClick={onOpenSearch} />
          <QuickAction icon={Images} label={t('profilePanel.media')} onClick={onOpenMedia} />
          <QuickAction
            icon={SlidersHorizontal}
            label={t('profilePanel.options')}
            onClick={onOpenActions}
          />
        </section>

        <section className="mt-7">
          <h4 className="mb-2 text-sm font-semibold text-[var(--text-muted)]">
            {t('profilePanel.about')}
          </h4>
          <div className="space-y-2 rounded-2xl bg-[var(--bg-app)] p-3">
            <p className="text-sm leading-6 text-[var(--text-secondary)]">
              {details.bio || t('publicProfile.noBio')}
            </p>
            {details.phone && <ProfileDetail icon={Phone} value={details.phone} />}
            {details.birth_date && (
              <ProfileDetail
                icon={CalendarDays}
                value={new Date(details.birth_date).toLocaleDateString(dateLocale)}
              />
            )}
            {details.social_links.map((link) => {
              const Icon = getSocialIcon(link)
              return (
                <a
                  key={link}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-500 flex items-center gap-2 truncate rounded-lg p-2 hover:bg-[var(--bg-hover)] hover:underline"
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{getSocialLabel(link)}</span>
                </a>
              )
            })}
          </div>
        </section>

        <section className="mt-7">
          <h4 className="mb-2 text-sm font-semibold text-[var(--text-muted)]">
            {t('profilePanel.chatInfo')}
          </h4>
          <div className="overflow-hidden rounded-2xl bg-[var(--bg-app)]">
            <SettingRow
              icon={Bell}
              label={isMuted ? t('profilePanel.muted') : t('profilePanel.notificationsOn')}
              onClick={onOpenActions}
            />
            <SettingRow
              icon={Pin}
              label={isPinned ? t('profilePanel.pinned') : t('profilePanel.notPinned')}
              onClick={onOpenActions}
            />
            <SettingRow
              icon={ExternalLink}
              label={t('publicProfile.title')}
              href={`/profile/${profile.id}`}
            />
          </div>
        </section>

        <section className="mt-7">
          <MediaGallery
            mediaItems={mediaItems}
            totalCount={mediaTotalCount}
            onShowAll={onOpenMedia}
          />
        </section>
      </div>
    </aside>
  )
}

function QuickAction({
  icon: Icon,
  label,
  href,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  href?: string
  onClick?: () => void
}) {
  const content = (
    <>
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--bg-hover)]">
        <Icon className="h-5 w-5" />
      </span>
      <span className="line-clamp-2 text-center text-[11px] leading-4">{label}</span>
    </>
  )
  const className =
    'flex min-w-0 flex-col items-center gap-1.5 rounded-xl py-2 text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'

  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" className={className} onClick={onClick}>
      {content}
    </button>
  )
}

function SettingRow({
  icon: Icon,
  label,
  href,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  href?: string
  onClick?: () => void
}) {
  const content = (
    <>
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-hover)]">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
    </>
  )
  const className =
    'flex w-full items-center gap-3 border-b border-[var(--border-default)] px-3 py-3 text-left text-[var(--text-primary)] last:border-b-0 hover:bg-[var(--bg-hover)]'

  return href ? (
    <Link href={href} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" className={className} onClick={onClick}>
      {content}
    </button>
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

function ProfileDetail({
  icon: Icon,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  value: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg p-2 text-[var(--text-secondary)]">
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{value}</span>
    </div>
  )
}
