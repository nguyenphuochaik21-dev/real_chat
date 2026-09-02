import { createClient as createAdminClient } from '@supabase/supabase-js'
import webPush from 'web-push'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { isAllowedPushEndpoint } from '@/lib/push-endpoint'
import type { Database } from '@/types'

export const runtime = 'nodejs'

const requestSchema = z.object({
  messageId: z.string().uuid(),
})

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
  const vapidSubject = process.env.VAPID_SUBJECT

  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return Response.json({ error: 'Push notifications are not configured' }, { status: 503 })
  }

  const payload = requestSchema.safeParse(await request.json().catch(() => null))
  if (!payload.success) {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: ownedMessage } = await supabase
    .from('messages')
    .select('id')
    .eq('id', payload.data.messageId)
    .eq('sender_id', user.id)
    .maybeSingle()
  if (!ownedMessage) return Response.json({ error: 'Message not found' }, { status: 404 })

  const admin = createAdminClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const dispatchedAt = new Date().toISOString()
  const { data: message } = await admin
    .from('messages')
    .update({ push_sent_at: dispatchedAt })
    .eq('id', ownedMessage.id)
    .is('push_sent_at', null)
    .select('id, conversation_id, sender_id, content, content_type')
    .maybeSingle()

  if (!message?.conversation_id || !message.sender_id) return new Response(null, { status: 204 })

  const [{ data: participantRows }, { data: sender }] = await Promise.all([
    admin
      .from('conversation_participants')
      .select('user_id, is_muted, is_archived')
      .eq('conversation_id', message.conversation_id),
    admin
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', message.sender_id)
      .maybeSingle(),
  ])

  const recipientIds = (participantRows ?? [])
    .filter(
      (participant) =>
        participant.user_id !== message.sender_id &&
        !participant.is_muted &&
        !participant.is_archived
    )
    .map((participant) => participant.user_id)

  if (recipientIds.length === 0) return new Response(null, { status: 204 })

  const [{ data: blockRows }, { data: profiles }] = await Promise.all([
    admin
      .from('user_blocks')
      .select('blocker_id, blocked_id')
      .or(`blocker_id.eq.${message.sender_id},blocked_id.eq.${message.sender_id}`),
    admin.from('profiles').select('id, username').in('id', recipientIds),
  ])
  const blockedRecipients = new Set(
    (blockRows ?? []).flatMap((block) => {
      if (block.blocker_id === message.sender_id) return [block.blocked_id]
      if (block.blocked_id === message.sender_id) return [block.blocker_id]
      return []
    })
  )
  const allowedProfiles = (profiles ?? []).filter((profile) => !blockedRecipients.has(profile.id))
  const allowedIds = allowedProfiles.map((profile) => profile.id)
  if (allowedIds.length === 0) return new Response(null, { status: 204 })

  const { data: subscriptions } = await admin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', allowedIds)

  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
  const senderName = sender?.display_name || 'Chatly'
  const profileById = new Map(allowedProfiles.map((profile) => [profile.id, profile]))
  const expiredSubscriptionIds: string[] = []

  await Promise.allSettled(
    (subscriptions ?? []).map(async (subscription) => {
      if (
        !subscription.endpoint ||
        !isAllowedPushEndpoint(subscription.endpoint) ||
        !subscription.p256dh ||
        !subscription.auth
      ) {
        return
      }
      const username = subscription.user_id
        ? profileById.get(subscription.user_id)?.username || ''
        : ''
      const mentioned = Boolean(
        username &&
        new RegExp(`(^|\\s)@${escapeRegExp(username)}(?=\\s|$)`, 'i').test(message.content)
      )
      const body =
        message.content_type === 'text'
          ? message.content.slice(0, 160)
          : `${senderName} đã gửi một tệp đính kèm`

      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify({
            title: mentioned ? `${senderName} đã nhắc đến bạn` : senderName,
            body,
            tag: `conversation-${message.conversation_id}`,
            icon: sender?.avatar_url || '/pwa-icon/192',
            data: { conversationId: message.conversation_id },
          })
        )
      } catch (error) {
        const statusCode =
          typeof error === 'object' && error !== null && 'statusCode' in error
            ? Number(error.statusCode)
            : 0
        if (statusCode === 404 || statusCode === 410) expiredSubscriptionIds.push(subscription.id)
      }
    })
  )

  if (expiredSubscriptionIds.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', expiredSubscriptionIds)
  }

  return new Response(null, { status: 204 })
}
