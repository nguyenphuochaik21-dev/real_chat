'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, ExternalLink, Globe2, Phone, X } from 'lucide-react'
import { FaFacebookF, FaGithub, FaInstagram, FaLinkedinIn, FaYoutube } from 'react-icons/fa6'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import type { PublicProfile } from '@/types'
import type { PresenceStatus } from '@/lib/presence'
import { useI18n } from '@/lib/i18n'
import { getPublicProfile, type PublicProfileDetails } from '@/lib/actions/profile'

interface ConversationProfilePanelProps {
  profile: PublicProfile
  status: PresenceStatus
  onClose: () => void
}

export function ConversationProfilePanel({
  profile,
  status,
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
    <aside className="absolute inset-y-0 right-0 z-40 w-full overflow-y-auto border-l border-[var(--border-default)] bg-[var(--bg-panel)] shadow-xl sm:w-80">
      <header className="flex items-center justify-between border-b border-[var(--border-default)] p-4">
        <h2 className="font-semibold text-[var(--text-primary)]">{t('publicProfile.title')}</h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t('common.close')}>
          <X className="h-5 w-5" />
        </Button>
      </header>

      <div className="flex flex-col items-center p-6 text-center">
        <Avatar user={details} size="xl" showStatus statusOverride={status} />
        <h3 className="mt-4 text-xl font-semibold text-[var(--text-primary)]">
          {details.display_name}
        </h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">@{details.username}</p>
        <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">
          {details.bio || t('publicProfile.noBio')}
        </p>

        {(details.phone || details.birth_date || details.social_links.length > 0) && (
          <div className="mt-5 w-full space-y-2 text-left text-sm">
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
                  className="text-primary-500 flex items-center gap-2 truncate rounded-lg bg-[var(--bg-app)] p-3 hover:underline"
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{getSocialLabel(link)}</span>
                </a>
              )
            })}
          </div>
        )}

        <Link href={`/profile/${profile.id}`} className="mt-6 w-full">
          <Button variant="outline" className="w-full">
            <ExternalLink className="h-4 w-4" />
            {t('publicProfile.title')}
          </Button>
        </Link>
      </div>
    </aside>
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
    <div className="flex items-center gap-2 rounded-lg bg-[var(--bg-app)] p-3 text-[var(--text-secondary)]">
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{value}</span>
    </div>
  )
}
