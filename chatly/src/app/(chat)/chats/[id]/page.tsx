'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { ChatsList } from '@/components/chat/chats-list'
import { ChatView } from '@/components/chat/chat-view'
import { createClient } from '@/lib/supabase/client'

export default function ChatDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
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
        <div className="hidden md:block md:w-80">
          <ChatsList selectedConversationId={conversationId} currentUserId="" />
        </div>
        <div className="flex flex-1 items-center justify-center bg-[var(--bg-app)]">
          <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  if (!currentUserId) {
    return (
      <div className="flex h-full flex-1">
        <div className="hidden md:block md:w-80">
          <ChatsList selectedConversationId={conversationId} currentUserId="" />
        </div>
        <div className="flex flex-1 items-center justify-center bg-[var(--bg-app)]">
          <p className="text-[var(--text-muted)]">Please sign in to view chats</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-1">
      {/* Chats List Panel — desktop only on detail route (mobile shows chat fullscreen) */}
      <div className="hidden md:block md:w-80 md:shrink-0">
        <ChatsList selectedConversationId={conversationId} currentUserId={currentUserId} />
      </div>

      {/* Chat View */}
      <div className="flex flex-1 min-w-0">
        <ChatView
          conversationId={conversationId}
          currentUserId={currentUserId}
          showBackButton
          onBack={() => router.push('/chats')}
          scrollToMessageId={scrollToMessageId}
        />
      </div>
    </div>
  )
}
