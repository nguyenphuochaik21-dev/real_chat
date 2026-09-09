'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { usePathname, useRouter } from 'next/navigation'
import { MessageSquare, Users, Phone, Settings, Search, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { usePresence } from '@/hooks/use-presence'
import { NotificationBell, NotificationCenter } from '@/components/notifications'
import { useI18n } from '@/lib/i18n'
import { useFriendshipStore } from '@/stores/friendship-store'
import { useNavigationBadgesStore } from '@/stores/navigation-badges-store'

const SearchModal = dynamic(() =>
  import('@/components/chat/search-modal').then((module) => module.SearchModal)
)

const navItems = [
  { href: '/chats', icon: MessageSquare, labelKey: 'nav.chats' },
  { href: '/contacts', icon: Users, labelKey: 'nav.contacts' },
  { href: '/calls', icon: Phone, labelKey: 'nav.calls' },
  { href: '/settings', icon: Settings, labelKey: 'nav.settings' },
]

export interface SidebarProfile {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  status?: 'online' | 'offline' | 'away' | 'busy' | null
  role?: string
}

interface SidebarProps {
  userId: string
  profile: SidebarProfile | null
}

export function Sidebar({ userId, profile }: SidebarProps) {
  const { t } = useI18n()
  const pathname = usePathname()
  const router = useRouter()
  const unreadCount = useNavigationBadgesStore((state) => state.unreadMessages)
  const [showSearch, setShowSearch] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const friendRequestCount = useFriendshipStore((state) => state.incomingCount)

  usePresence(userId)

  const userForAvatar = profile || {
    id: 'unknown',
    username: 'user',
    display_name: 'User',
    avatar_url: null,
    status: 'offline' as const,
  }

  // Current user is always "online" since they're using the app
  const currentUserStatus = profile?.status || 'online'

  return (
    <>
      <aside className="flex h-full w-16 flex-col items-center border-r border-[var(--border-default)] bg-[var(--bg-sidebar)] py-4">
        {/* Logo */}
        <Link
          href="/chats"
          className="mb-6 flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl shadow-sm"
          aria-label="Chatly"
        >
          <Image src="/icons/chatly-192.png" alt="" width={40} height={40} priority />
        </Link>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-2">
          {/* Search button */}
          <button
            onClick={() => setShowSearch(true)}
            className="flex h-12 w-12 items-center justify-center rounded-xl text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            title={t('nav.search')}
            aria-label={t('nav.search')}
          >
            <Search className="h-5 w-5" />
          </button>

          {/* Notification bell */}
          <NotificationBell onClick={() => setShowNotifications(true)} />
          {[
            ...navItems,
            ...(profile?.role === 'admin'
              ? [{ href: '/admin', icon: ShieldCheck, labelKey: 'nav.admin' }]
              : []),
          ].map((item) => {
            const isActive =
              item.href === '/chats'
                ? pathname.startsWith('/chats') || pathname === '/'
                : pathname.startsWith(item.href)
            const badgeCount =
              item.href === '/chats'
                ? unreadCount
                : item.href === '/contacts'
                  ? friendRequestCount
                  : 0

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group relative flex h-12 w-12 items-center justify-center rounded-xl transition-colors',
                  isActive
                    ? 'text-primary-500 bg-[var(--bg-active)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                )}
                title={t(item.labelKey)}
                aria-label={t(item.labelKey)}
              >
                <item.icon className="h-5 w-5" />

                {/* Active indicator */}
                {isActive && (
                  <span className="bg-primary-500 absolute top-1/2 left-0 h-8 w-1 -translate-y-1/2 rounded-r-full" />
                )}

                {/* Unread badge */}
                {badgeCount > 0 && (
                  <span className="bg-primary-500 absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-medium text-white">
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* User avatar - show online status since user is active */}
        <Link href="/settings" className="mt-auto rounded-xl transition-transform hover:scale-105">
          <Avatar user={userForAvatar} size="md" showStatus statusOverride={currentUserStatus} />
        </Link>
      </aside>

      {/* Global Search Modal */}
      <SearchModal
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        currentUserId={profile?.id || ''}
        onSelectMessage={(result, conversationId) => {
          // Navigate to conversation and scroll to the specific message
          router.push(`/chats/${conversationId}?scrollTo=${result.id}`)
        }}
        onSelectContact={(contact) => {
          console.log('Selected contact:', contact)
        }}
      />

      {/* Notification center */}
      <NotificationCenter isOpen={showNotifications} onClose={() => setShowNotifications(false)} />
    </>
  )
}
