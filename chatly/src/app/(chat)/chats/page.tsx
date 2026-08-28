'use client'

import { useState, useEffect, useRef } from 'react'
import { ChatsList } from '@/components/chat/chats-list'
import { ChatView } from '@/components/chat/chat-view'
import { createClient } from '@/lib/supabase/client'

export default function ChatsPage() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const supabaseRef = useRef(createClient())

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabaseRef.current.auth.getUser()
      setCurrentUserId(user?.id || null)
      setLoading(false)
    }
    getUser()
  }, [])

  if (loading) {
    return (
      <div className="flex h-full flex-1 items-center justify-center bg-[var(--bg-app)]">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary-500 border-t-transparent" />
      </div>
    )
  }

  if (!currentUserId) {
    return (
      <div className="flex h-full flex-1 items-center justify-center bg-[var(--bg-app)]">
        <p className="text-[var(--text-muted)]">Please sign in to view chats</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-1">
      {/* Chats List Panel — full width on mobile, fixed width on desktop */}
      <ChatsList
        selectedConversationId={null}
        currentUserId={currentUserId}
      />

      {/* Empty state — desktop only */}
      <div className="hidden flex-1 flex-col items-center justify-center bg-[var(--bg-app)] text-[var(--text-muted)] md:flex">
        <div className="text-center">
          <p className="text-lg">Select a conversation</p>
          <p className="mt-2 text-sm">Choose a chat from the list</p>
        </div>
      </div>
    </div>
  )
}
