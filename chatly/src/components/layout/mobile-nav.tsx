'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MessageSquare, Users, Phone, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import { useFriendshipStore } from '@/stores/friendship-store'

const items = [
  { href: '/chats', icon: MessageSquare, labelKey: 'nav.chats' },
  { href: '/contacts', icon: Users, labelKey: 'nav.contacts' },
  { href: '/calls', icon: Phone, labelKey: 'nav.calls' },
  { href: '/settings', icon: Settings, labelKey: 'nav.settings' },
]

export function MobileNav() {
  const { t } = useI18n()
  const pathname = usePathname()
  const friendRequestCount = useFriendshipStore((state) => state.incomingCount)

  // Hide nav when inside a conversation chat (Messenger-style)
  const isInChat = /^\/chats\/[^/]+/.test(pathname)
  if (isInChat) return null

  const isActive = (href: string) => {
    if (href === '/chats') return pathname.startsWith('/chats') || pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <nav
      aria-label={t('nav.mobile')}
      className="fixed right-0 bottom-0 left-0 z-40 flex min-h-14 items-start justify-around border-t border-[var(--border-default)] bg-[var(--bg-panel)] pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {items.map((item) => {
        const active = isActive(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors',
              active ? 'text-primary-500' : 'text-[var(--text-muted)]'
            )}
            aria-current={active ? 'page' : undefined}
          >
            <span className="relative">
              <item.icon className="h-5 w-5" />
              {item.href === '/contacts' && friendRequestCount > 0 && (
                <span className="bg-primary-500 absolute -top-2 -right-3 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-semibold text-white">
                  {friendRequestCount > 99 ? '99+' : friendRequestCount}
                </span>
              )}
            </span>
            <span className="text-[10px] font-medium">{t(item.labelKey)}</span>
          </Link>
        )
      })}
    </nav>
  )
}
