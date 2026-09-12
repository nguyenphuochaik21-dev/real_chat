'use client'

import { useLayoutEffect } from 'react'
import { usePathname } from 'next/navigation'
import { AuthSessionNotice } from '@/components/auth/auth-session-notice'
import { CallProvider } from '@/components/calls'
import { MobileNav } from '@/components/layout/mobile-nav'
import { Sidebar, type SidebarProfile } from '@/components/layout/sidebar'
import { NotificationToastContainer } from '@/components/notifications'
import { RealtimeNotifications } from '@/components/notifications/realtime-notifications'
import { CurrentUserProvider } from '@/hooks/use-current-user-id'
import { useFriendshipsRealtime } from '@/hooks/use-friendships-realtime'
import { useNavigationBadges } from '@/hooks/use-navigation-badges'
import { cn } from '@/lib/utils'
import { resetUserSessionState } from '@/lib/reset-user-session'
import { useChatsListStore } from '@/stores/chats-list-store'

let activeClientUserId: string | null = null

interface ChatShellProps {
  children: React.ReactNode
  userId: string
  profile: SidebarProfile | null
}

export function ChatShell({ children, userId, profile }: ChatShellProps) {
  const pathname = usePathname()

  useLayoutEffect(() => {
    if (activeClientUserId && activeClientUserId !== userId) {
      resetUserSessionState()
    }
    activeClientUserId = userId
    useChatsListStore.getState().beginUserSession(userId)
  }, [userId])

  useFriendshipsRealtime(userId)
  useNavigationBadges(userId)

  const isInChat = /^\/chats\/[^/]+/.test(pathname)

  return (
    <CurrentUserProvider userId={userId}>
      <div className="flex h-[100dvh] w-full min-w-0 overflow-hidden bg-[var(--bg-app)]">
        <div className="hidden md:block">
          <Sidebar userId={userId} profile={profile} />
        </div>
        <div
          className={cn(
            'flex min-w-0 flex-1 overflow-hidden md:pb-0',
            isInChat ? 'pb-0' : 'pb-[calc(3.5rem+env(safe-area-inset-bottom))]'
          )}
        >
          <CallProvider userId={userId}>
            <AuthSessionNotice />
            <RealtimeNotifications userId={userId} isAdmin={profile?.role === 'admin'} />
            {children}
            <NotificationToastContainer />
          </CallProvider>
        </div>
        <MobileNav />
      </div>
    </CurrentUserProvider>
  )
}
