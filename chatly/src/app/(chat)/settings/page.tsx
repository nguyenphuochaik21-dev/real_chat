'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  User,
  Palette,
  Moon,
  Sun,
  ChevronRight,
  LogOut,
  Languages,
  ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useTheme } from 'next-themes'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/types'
import { useI18n, type Locale } from '@/lib/i18n'
import { removeCurrentPushSubscription } from '@/lib/push'

type Profile = Pick<
  Tables<'profiles'>,
  'id' | 'username' | 'display_name' | 'avatar_url' | 'bio' | 'role'
>

interface SettingsSectionProps {
  title: string
  items: {
    icon: React.ElementType
    title: string
    description?: string
    href?: string
    onClick?: () => void
    rightElement?: React.ReactNode
  }[]
}

function SettingsSection({ title, items }: SettingsSectionProps) {
  const router = useRouter()

  return (
    <div className="mb-6">
      <h3 className="mb-2 px-4 text-sm font-medium text-[var(--text-muted)]">{title}</h3>
      <div className="rounded-xl bg-[var(--bg-panel)]">
        {items.map((item, index) => (
          <div key={item.title}>
            <div
              className={cn(
                'flex items-center gap-4 px-4 py-3 transition-colors hover:bg-[var(--bg-hover)]',
                item.href && 'cursor-pointer'
              )}
              onClick={item.onClick ?? (item.href ? () => router.push(item.href!) : undefined)}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-hover)]">
                <item.icon className="h-5 w-5 text-[var(--text-secondary)]" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-[var(--text-primary)]">{item.title}</p>
                {item.description && (
                  <p className="text-xs text-[var(--text-muted)]">{item.description}</p>
                )}
              </div>
              {item.rightElement !== undefined ? (
                item.rightElement
              ) : (
                <ChevronRight className="h-5 w-5 text-[var(--text-muted)]" />
              )}
            </div>
            {index < items.length - 1 && <Separator />}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const { locale, setLocale, t } = useI18n()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const fetchProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url, bio, role')
          .eq('id', user.id)
          .single()
        setProfile(data)
      }
      setLoading(false)
    }
    fetchProfile()
  }, [supabase])

  const handleSignOut = async () => {
    await removeCurrentPushSubscription().catch(() => undefined)
    await supabase.auth.signOut()
    router.push('/login')
  }

  const userForAvatar = profile || {
    id: 'unknown',
    username: 'user',
    display_name: t('common.user'),
    avatar_url: null,
  }

  if (loading) {
    return (
      <div className="flex h-full flex-1 items-center justify-center bg-[var(--bg-app)]">
        <div className="border-primary-500 h-8 w-8 animate-spin rounded-full border-3 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-1 flex-col bg-[var(--bg-app)]">
      {/* Header */}
      <div className="border-b border-[var(--border-default)] bg-[var(--bg-panel)] p-4">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">{t('settings.title')}</h1>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {/* Profile Card */}
          <div className="mb-6 rounded-xl bg-[var(--bg-panel)] p-4">
            <div className="flex items-center gap-4">
              <Avatar user={userForAvatar} size="xl" showStatus />
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                  {profile?.display_name || t('common.user')}
                </h2>
                <p className="text-sm text-[var(--text-muted)]">
                  {profile?.bio || t('settings.noBio')}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => router.push('/settings/profile')}
                >
                  {t('settings.editProfile')}
                </Button>
              </div>
            </div>
          </div>

          {/* Settings Sections */}
          <SettingsSection
            title={t('settings.account')}
            items={[
              {
                icon: User,
                title: t('settings.profile'),
                description: t('settings.profileHint'),
                href: '/settings/profile',
              },
              ...(profile?.role === 'admin'
                ? [
                    {
                      icon: ShieldCheck,
                      title: t('admin.title'),
                      description: t('admin.subtitle'),
                      href: '/admin',
                    },
                  ]
                : []),
            ]}
          />

          <SettingsSection
            title={t('settings.appearance')}
            items={[
              {
                icon: theme === 'dark' ? Sun : Moon,
                title: theme === 'dark' ? t('settings.lightMode') : t('settings.darkMode'),
                description:
                  theme === 'dark' ? t('settings.switchLight') : t('settings.switchDark'),
                onClick: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
              },
              {
                icon: Palette,
                title: t('settings.theme'),
                description: t('settings.themeHint'),
                href: '/settings/appearance',
              },
              {
                icon: Languages,
                title: t('settings.language'),
                description: t('settings.languageHint'),
                rightElement: (
                  <select
                    value={locale}
                    onChange={(event) => setLocale(event.target.value as Locale)}
                    onClick={(event) => event.stopPropagation()}
                    className="focus:ring-primary-500 rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] px-2 py-1.5 text-sm text-[var(--text-primary)] focus:ring-2 focus:outline-none"
                    aria-label={t('settings.language')}
                  >
                    <option value="vi">{t('settings.vietnamese')}</option>
                    <option value="en">{t('settings.english')}</option>
                  </select>
                ),
              },
            ]}
          />

          {/* Sign Out */}
          <SettingsSection
            title=""
            items={[
              {
                icon: LogOut,
                title: t('settings.signOut'),
                description: t('settings.signOutHint'),
                onClick: handleSignOut,
                rightElement: null,
              },
            ]}
          />

          {/* App info */}
          <div className="mt-8 text-center">
            <p className="text-sm text-[var(--text-muted)]">Chatly v1.0.0</p>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
