'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { usePathname } from 'next/navigation'
import { ChatsList } from '@/components/chat/chats-list'
import { ChatView } from '@/components/chat/chat-view'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'

export default function ChatsLayout() {
  const { t } = useI18n()
  const [currentUserId, setCurrentUserId] = useState('')
  const pathname = usePathname()
  const params = useParams<{ id?: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()

  const conversationId = params.id ?? null
  const scrollToMessageId = searchParams.get('scrollTo') || undefined

  // ChatsList chỉ hiển thị trên /chats paths
  const showChatsList = pathname.startsWith('/chats')

  useEffect(() => {
    const supabase = createClient()
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      setCurrentUserId(user?.id || '')
    }
    getUser()
  }, [])

  if (!showChatsList) {
    return null
  }

  return (
    <div className="flex h-full min-w-0 flex-1 overflow-hidden">
      {/* Chats list — mobile (only when no conversation open) + desktop always */}
      <div
        className={cn(
          'min-w-0 md:block md:w-80 md:shrink-0',
          conversationId ? 'hidden' : 'block w-full'
        )}
      >
        <ChatsList currentUserId={currentUserId} />
      </div>

      {/* Chat view — full width on mobile (Messenger style), beside list on desktop */}
      <div
        className={cn(
          'flex min-w-0 overflow-hidden md:flex-1',
          conversationId ? 'flex-1' : 'hidden md:flex'
        )}
      >
        {conversationId ? (
          <ChatView
            conversationId={conversationId}
            currentUserId={currentUserId}
            showBackButton
            onBack={() => router.push('/chats')}
            scrollToMessageId={scrollToMessageId}
          />
        ) : (
          <div className="flex h-full flex-1 flex-col items-center justify-center bg-[var(--bg-app)] text-[var(--text-muted)]">
            <div className="text-center">
              <p className="text-lg">{t('chat.selectConversation')}</p>
              <p className="mt-2 text-sm">{t('chat.chooseConversation')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
