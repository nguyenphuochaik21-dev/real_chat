'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { ChatsList } from '@/components/chat/chats-list'
import { ChatView } from '@/components/chat/chat-view'
import { createClient } from '@/lib/supabase/client'

export default function ChatDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const conversationId = params.id as string
  const scrollToMessageId = searchParams.get('scrollTo') || undefined
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
      <div className="flex h-full flex-1">
        <ChatsList selectedConversationId={conversationId} currentUserId="" />
        <div className="flex flex-1 items-center justify-center bg-[var(--bg-app)]">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  if (!currentUserId) {
    return (
      <div className="flex h-full flex-1">
        <ChatsList selectedConversationId={conversationId} currentUserId="" />
        <div className="flex flex-1 items-center justify-center bg-[var(--bg-app)]">
          <p className="text-[var(--text-muted)]">Please sign in to view chats</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-1">
      {/* Chats List Panel */}
      <ChatsList selectedConversationId={conversationId} currentUserId={currentUserId} />

      {/* Chat View */}
      <div className="flex flex-1">
        <ChatView
          conversationId={conversationId}
          currentUserId={currentUserId}
          showBackButton={false}
          scrollToMessageId={scrollToMessageId}
        />
      </div>
    </div>
  )
}
