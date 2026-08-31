'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Sidebar } from '@/components/layout/sidebar'
import { MobileNav } from '@/components/layout/mobile-nav'
import { ConversationLabelsProvider } from '@/hooks/use-conversation-labels'
import { CallProvider } from '@/components/calls'
import type { User } from '@supabase/supabase-js'
import { cn } from '@/lib/utils'

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const pathname = usePathname()

  useEffect(() => {
    const supabase = createClient()
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
    }
    getUser()
  }, [])

  // When inside a conversation chat (mobile, Messenger-style), drop the bottom
  // padding that reserves space for the mobile nav.
  const isInChat = /^\/chats\/[^/]+/.test(pathname)

  return (
    <div className="flex h-[100dvh] w-full min-w-0 overflow-hidden bg-[var(--bg-app)]">
      <div className="hidden md:block">
        <Sidebar />
      </div>
      <div
        className={cn('flex min-w-0 flex-1 overflow-hidden md:pb-0', isInChat ? 'pb-0' : 'pb-14')}
      >
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="border-primary-500 h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
          </div>
        ) : user ? (
          <ConversationLabelsProvider userId={user.id}>
            <CallProvider userId={user.id}>{children}</CallProvider>
          </ConversationLabelsProvider>
        ) : (
          children
        )}
      </div>
      <MobileNav />
    </div>
  )
}
