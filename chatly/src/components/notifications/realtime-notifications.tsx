'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n'
import { useNotificationStore } from '@/stores/notification-store'

interface RealtimeNotificationsProps {
  userId: string
  isAdmin: boolean
}

export function RealtimeNotifications({ userId, isAdmin }: RealtimeNotificationsProps) {
  const { t } = useI18n()
  const pathname = usePathname()
  const pathnameRef = useRef(pathname)
  const mediaGroupVersionsRef = useRef(new Map<string, number>())

  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  useEffect(() => {
    if (!userId) return
    let active = true
    const mediaGroupVersions = mediaGroupVersionsRef.current
    const supabase = createClient()
    const addNotification = useNotificationStore.getState().addNotification

    let channel = supabase
      .channel(`notifications:${userId}:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          if (!active) return
          const message = payload.new as {
            id: string
            sender_id: string
            conversation_id: string
            content: string
            content_type: string | null
            media_group_id: string | null
          }
          if (message.sender_id === userId) return
          if (
            document.visibilityState === 'visible' &&
            pathnameRef.current === `/chats/${message.conversation_id}`
          ) {
            return
          }

          if (message.media_group_id) {
            const version = (mediaGroupVersions.get(message.media_group_id) ?? 0) + 1
            mediaGroupVersions.set(message.media_group_id, version)
            await new Promise((resolve) => window.setTimeout(resolve, 350))
            if (!active || mediaGroupVersions.get(message.media_group_id) !== version) {
              return
            }
            mediaGroupVersions.delete(message.media_group_id)
          }

          const [{ data: participation }, { data: block }, { data: sender }, { data: profile }] =
            await Promise.all([
              supabase
                .from('conversation_participants')
                .select('is_muted, is_archived')
                .eq('conversation_id', message.conversation_id)
                .eq('user_id', userId)
                .maybeSingle(),
              supabase
                .from('user_blocks')
                .select('id')
                .eq('blocker_id', userId)
                .eq('blocked_id', message.sender_id)
                .maybeSingle(),
              supabase
                .from('profiles')
                .select('display_name, avatar_url')
                .eq('id', message.sender_id)
                .maybeSingle(),
              supabase.from('profiles').select('username').eq('id', userId).maybeSingle(),
            ])

          if (!active || !participation || participation.is_muted || participation.is_archived)
            return
          if (block) return

          const username = profile?.username || ''
          const escapedUsername = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const mentioned = Boolean(
            escapedUsername &&
            new RegExp(`(^|\\s)@${escapedUsername}(?=\\s|$)`, 'i').test(message.content)
          )
          const senderName = sender?.display_name || t('common.user')
          const body =
            message.content_type === 'text'
              ? message.content.slice(0, 100)
              : t('notifications.attachment', { name: senderName })

          addNotification({
            type: mentioned ? 'mention' : 'message',
            title: mentioned ? t('notifications.mentioned', { name: senderName }) : senderName,
            body,
            conversationId: message.conversation_id,
            messageId: message.id,
            senderId: message.sender_id,
            senderName,
            senderAvatar: sender?.avatar_url,
          })
        }
      )

    channel = channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'support_requests',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        if (!active) return
        const request = payload.new as {
          id: string
          admin_response: string | null
          status: string
        }
        const previous = payload.old as { admin_response?: string | null }
        if (!request.admin_response || request.admin_response === previous.admin_response) return
        addNotification({
          type: 'support',
          title: t('support.replyReceived'),
          body: request.admin_response.slice(0, 120),
          url: `/settings/support#support-${request.id}`,
        })
      }
    )

    if (isAdmin) {
      channel = channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'support_requests',
          filter: `assigned_admin_id=eq.${userId}`,
        },
        async (payload) => {
          if (!active) return
          const request = payload.new as {
            id: string
            user_id: string
            category: string
            content: string
          }
          const { data: sender } = await supabase
            .from('profiles')
            .select('display_name')
            .eq('id', request.user_id)
            .maybeSingle()
          if (!active) return
          addNotification({
            type: 'support',
            title: t('admin.newSupportRequest'),
            body: `${sender?.display_name ?? t('common.user')}: ${request.content.slice(0, 100)}`,
            senderId: request.user_id,
            senderName: sender?.display_name,
            url: `/admin#support-${request.id}`,
          })
        }
      )
    }

    channel.subscribe()

    return () => {
      active = false
      mediaGroupVersions.clear()
      void supabase.removeChannel(channel)
    }
  }, [isAdmin, t, userId])

  return null
}
