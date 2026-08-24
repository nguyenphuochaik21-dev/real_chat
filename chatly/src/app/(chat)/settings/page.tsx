'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  User,
  Bell,
  Palette,
  MessageSquare,
  Database,
  HelpCircle,
  Share2,
  Moon,
  Sun,
  ChevronRight,
  Shield,
  Lock,
  QrCode,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { useTheme } from 'next-themes'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/types'

type Profile = Tables<'profiles'>

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
              onClick={item.onClick}
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
              {item.rightElement || <ChevronRight className="h-5 w-5 text-[var(--text-muted)]" />}
            </div>
            {index < items.length - 1 && <Separator />}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [notifications, setNotifications] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()
        setProfile(data)
      }
      setLoading(false)
    }
    fetchProfile()
  }, [supabase])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const userForAvatar = profile || {
    id: 'unknown',
    username: 'user',
    display_name: 'User',
    avatar_url: null,
  }

  if (loading) {
    return (
      <div className="flex h-full flex-1 items-center justify-center bg-[var(--bg-app)]">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-1 flex-col bg-[var(--bg-app)]">
      {/* Header */}
      <div className="border-b border-[var(--border-default)] bg-[var(--bg-panel)] p-4">
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Settings</h1>
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
                  {profile?.display_name || 'User'}
                </h2>
                <p className="text-sm text-[var(--text-muted)]">{profile?.bio || 'No bio yet'}</p>
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => router.push('/settings/profile')}>
                  Edit Profile
                </Button>
              </div>
              <Button variant="ghost" size="icon">
                <QrCode className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Settings Sections */}
          <SettingsSection
            title="Account"
            items={[
              {
                icon: User,
                title: 'Profile',
                description: 'Change name, photo, about',
                href: '/settings/profile',
              },
              {
                icon: Shield,
                title: 'Privacy',
                description: 'Block contacts, disappearing messages',
                href: '/settings/privacy',
              },
              {
                icon: Lock,
                title: 'Security',
                description: 'Two-step verification, password',
                href: '/settings/security',
              },
            ]}
          />

          <SettingsSection
            title="Notifications"
            items={[
              {
                icon: Bell,
                title: 'Notifications',
                description: 'Message, group, call tones',
                rightElement: (
                  <button
                    onClick={() => setNotifications(!notifications)}
                    className={cn(
                      'relative h-6 w-11 rounded-full transition-colors',
                      notifications ? 'bg-primary-500' : 'bg-[var(--border-strong)]'
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                        notifications ? 'left-[22px]' : 'left-0.5'
                      )}
                    />
                  </button>
                ),
              },
            ]}
          />

          <SettingsSection
            title="Appearance"
            items={[
              {
                icon: theme === 'dark' ? Sun : Moon,
                title: theme === 'dark' ? 'Light Mode' : 'Dark Mode',
                description: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
                onClick: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
              },
              {
                icon: Palette,
                title: 'Theme',
                description: 'Blue, Green, Pink, Purple',
                href: '/settings/theme',
              },
            ]}
          />

          <SettingsSection
            title="Chats"
            items={[
              {
                icon: MessageSquare,
                title: 'Chat History',
                description: 'Export, delete chat history',
                href: '/settings/chats',
              },
            ]}
          />

          <SettingsSection
            title="Storage & Data"
            items={[
              {
                icon: Database,
                title: 'Storage',
                description: '2.3 GB used',
                href: '/settings/storage',
              },
            ]}
          />

          <SettingsSection
            title="Help"
            items={[
              {
                icon: HelpCircle,
                title: 'Help Center',
                description: 'FAQ, contact us',
                href: '/settings/help',
              },
              {
                icon: Share2,
                title: 'Invite Friends',
                description: 'Share with friends',
                href: '/settings/invite',
              },
            ]}
          />

          {/* Sign Out */}
          <SettingsSection
            title=""
            items={[
              {
                icon: LogOut,
                title: 'Sign Out',
                description: 'Sign out of your account',
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
