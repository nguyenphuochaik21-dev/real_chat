'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Sidebar } from '@/components/layout/sidebar'
import { ConversationLabelsProvider } from '@/hooks/use-conversation-labels'
import { CallProvider } from '@/components/calls'
import type { User } from '@supabase/supabase-js'

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
    }
    getUser()
  }, [])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg-app)]">
      <Sidebar />
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
        </div>
      ) : user ? (
        <ConversationLabelsProvider userId={user.id}>
          <CallProvider userId={user.id}>
            {children}
          </CallProvider>
        </ConversationLabelsProvider>
      ) : (
        children
      )}
    </div>
  )
}
