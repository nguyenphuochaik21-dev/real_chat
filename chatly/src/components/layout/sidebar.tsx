'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  MessageSquare,
  Users,
  Phone,
  CircleDot,
  Settings,
  Search,
  MessageCircle,
  ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { usePresence } from '@/hooks/use-presence'
import { SearchModal } from '@/components/chat/search-modal'
import {
  NotificationBell,
  NotificationToastContainer,
  NotificationCenter,
} from '@/components/notifications'
import { useNotificationStore } from '@/stores/notification-store'
import { useI18n } from '@/lib/i18n'

const navItems = [
  { href: '/chats', icon: MessageSquare, labelKey: 'nav.chats' },
  { href: '/contacts', icon: Users, labelKey: 'nav.contacts' },
  { href: '/calls', icon: Phone, labelKey: 'nav.calls' },
  { href: '/starred', icon: MessageCircle, labelKey: 'nav.starred' },
  { href: '/status', icon: CircleDot, labelKey: 'nav.status' },
  { href: '/settings', icon: Settings, labelKey: 'nav.settings' },
]

interface Profile {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  status?: 'online' | 'offline' | 'away' | 'busy'
  role?: 'user' | 'admin'
}

async function setUserOnline(supabase: ReturnType<typeof createClient>) {
  try {
    await supabase.rpc('set_user_online')
  } catch {
    // Silently fail
  }
}

async function setUserOffline(supabase: ReturnType<typeof createClient>) {
  try {
    await supabase.rpc('set_user_offline')
  } catch {
    // Silently fail
  }
}

export function Sidebar() {
  const { t } = useI18n()
  const pathname = usePathname()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)
  const [showSearch, setShowSearch] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const supabaseRef = useRef(createClient())
  const pathnameRef = useRef(pathname)

  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  // Notification store
  const notificationUnreadCount = useNotificationStore((s) => s.unreadCount)

  // Initialize presence tracking for current user
  const {} = usePresence(profile?.id || null)

  // Load profile + fetch unread count + subscribe to updates
  useEffect(() => {
    let mounted = true
    let unreadChannel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null
    let notificationChannel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null
    let currentUserId: string | null = null

    const supabase = supabaseRef.current
    const subscriptionId = crypto.randomUUID()

    const addNotification = useNotificationStore.getState().addNotification

    const setupNotificationSubscription = (userId: string) => {
      if (notificationChannel) {
        supabase.removeChannel(notificationChannel)
        notificationChannel = null
      }
      notificationChannel = supabase
        .channel(`notifications:${userId}:${subscriptionId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
          },
          async (payload) => {
            if (!mounted) return

            const newMsg = payload.new as {
              id: string
              sender_id: string
              conversation_id: string
              content: string
              created_at: string
            }

            // Skip if from current user
            if (newMsg.sender_id === userId) return

            // Skip if we're viewing this conversation
            if (pathnameRef.current === `/chats/${newMsg.conversation_id}`) return

            // Check conversation participation flags (muted / archived)
            const { data: participation } = await supabase
              .from('conversation_participants')
              .select('is_muted, is_archived')
              .eq('conversation_id', newMsg.conversation_id)
              .eq('user_id', userId)
              .single()

            if (participation?.is_archived) {
              console.log('[Sidebar Notifications] Skipped: conversation is archived')
              return
            }

            if (participation?.is_muted) {
              console.log('[Sidebar Notifications] Skipped: conversation is muted')
              return
            }

            // Check block status
            const { data: blockCheck } = await supabase
              .from('user_blocks')
              .select('id')
              .or(
                `and(blocker_id.eq.${userId},blocked_id.eq.${newMsg.sender_id}),and(blocker_id.eq.${newMsg.sender_id},blocked_id.eq.${userId})`
              )
              .limit(1)

            if (blockCheck?.length) {
              console.log('[Sidebar Notifications] Skipped: user is blocked')
              return
            }

            // Fetch sender info
            const { data: sender } = await supabase
              .from('profiles')
              .select('display_name, avatar_url')
              .eq('id', newMsg.sender_id)
              .single()

            addNotification({
              type: 'message',
              title: sender?.display_name || 'New message',
              body: newMsg.content.slice(0, 100) + (newMsg.content.length > 100 ? '...' : ''),
              conversationId: newMsg.conversation_id,
              senderId: newMsg.sender_id,
              senderName: sender?.display_name,
              senderAvatar: sender?.avatar_url,
            })
          }
        )
        .subscribe()
    }

    const fetchUnreadCount = async (userId: string) => {
      // Get conversations with their participants' last_read_at
      const { data: participations } = await supabase
        .from('conversation_participants')
        .select('conversation_id, last_read_at')
        .eq('user_id', userId)

      if (!participations || participations.length === 0) {
        setUnreadCount(0)
        return
      }

      let totalUnread = 0
      for (const part of participations) {
        const cutoff = part.last_read_at || '1970-01-01T00:00:00Z'
        const { count } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', part.conversation_id)
          .neq('sender_id', userId)
          .gt('created_at', cutoff)

        totalUnread += count || 0
      }

      setUnreadCount(totalUnread)
    }

    // Subscribe to message inserts and participant updates
    const setupUnreadSubscription = (userId: string) => {
      currentUserId = userId
      // Remove old channel first to avoid "already subscribed" errors
      if (unreadChannel) {
        supabase.removeChannel(unreadChannel)
        unreadChannel = null
      }
      const channel = supabase
        .channel(`sidebar-unread:${userId}:${subscriptionId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
          },
          async (payload) => {
            if (!mounted) return

            const newMsg = payload.new as {
              sender_id: string
              conversation_id: string
              created_at?: string
            }
            if (newMsg.sender_id !== userId) {
              const part = await supabase
                .from('conversation_participants')
                .select('last_read_at')
                .eq('user_id', userId)
                .eq('conversation_id', newMsg.conversation_id)
                .single()

              const lastRead = part.data?.last_read_at || '1970-01-01T00:00:00Z'
              const msgTime = newMsg.created_at || new Date().toISOString()

              if (msgTime > lastRead) {
                setUnreadCount((prev) => prev + 1)
              }
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'conversation_participants',
            filter: `user_id=eq.${userId}`,
          },
          () => {
            fetchUnreadCount(userId)
          }
        )
      unreadChannel = channel
      channel.subscribe()
    }

    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (user && mounted) {
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()

        if (mounted) {
          setProfile(data)
          setLoading(false)
          // Set user as online on mount
          await setUserOnline(supabase)

          // Now fetch unread count and setup subscription with userId available
          await fetchUnreadCount(user.id)
          setupUnreadSubscription(user.id)
          setupNotificationSubscription(user.id)
        }
      } else if (mounted) {
        setLoading(false)
      }
    }

    loadProfile()

    return () => {
      mounted = false
      if (unreadChannel) void supabase.removeChannel(unreadChannel)
      if (notificationChannel) void supabase.removeChannel(notificationChannel)
      if (currentUserId) void setUserOffline(supabase)
    }
  }, [])

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
          className="bg-primary-500 mb-6 flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-sm"
        >
          <MessageSquare className="h-5 w-5" />
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
            const showBadge = item.href === '/chats' && unreadCount > 0

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
                {showBadge && (
                  <span className="bg-primary-500 absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-medium text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* User avatar - show online status since user is active */}
        {!loading && (
          <Link
            href="/settings"
            className="mt-auto rounded-xl transition-transform hover:scale-105"
          >
            <Avatar user={userForAvatar} size="md" showStatus statusOverride={currentUserStatus} />
          </Link>
        )}
      </aside>

      {/* Global Search Modal */}
      <SearchModal
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
        currentUserId={profile?.id || ''}
        onSelectMessage={(result, conversationId) => {
          // Navigate to conversation and scroll to the specific message
          window.location.href = `/chats/${conversationId}?scrollTo=${result.id}`
        }}
        onSelectContact={(contact) => {
          console.log('Selected contact:', contact)
        }}
      />

      {/* Toast notifications */}
      <NotificationToastContainer />

      {/* Notification center */}
      <NotificationCenter isOpen={showNotifications} onClose={() => setShowNotifications(false)} />
    </>
  )
}
