import { createClient as createAdminClient } from '@supabase/supabase-js'
import webPush from 'web-push'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { isAllowedPushEndpoint } from '@/lib/push-endpoint'
import type { Database } from '@/types'

export const runtime = 'nodejs'

const requestSchema = z.object({
  sessionId: z.string().uuid(),
})

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
  const vapidSubject = process.env.VAPID_SUBJECT

  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return Response.json({ error: 'Push notifications are not configured' }, { status: 503 })
  }

  const values = requestSchema.safeParse(await request.json().catch(() => null))
  if (!values.success) return Response.json({ error: 'Invalid request' }, { status: 400 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: session } = await supabase
    .from('call_sessions')
    .select('id, caller_id, callee_id, conversation_id, call_type, status, created_at')
    .eq('id', values.data.sessionId)
    .eq('caller_id', user.id)
    .in('status', ['pending', 'ringing'])
    .maybeSingle()
  if (!session?.callee_id || !session.conversation_id) {
    return Response.json({ error: 'Call not found' }, { status: 404 })
  }

  const admin = createAdminClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const expiresAt = Date.parse(session.created_at ?? '') + 45_000
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now())
    return new Response(null, { status: 204 })
  const [{ data: caller }, { data: participation }, { data: blocks }, { data: subscriptions }] =
    await Promise.all([
      admin
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', session.caller_id)
        .maybeSingle(),
      admin
        .from('conversation_participants')
        .select('is_muted, is_archived')
        .eq('conversation_id', session.conversation_id)
        .eq('user_id', session.callee_id)
        .maybeSingle(),
      admin
        .from('user_blocks')
        .select('id')
        .or(
          `and(blocker_id.eq.${session.caller_id},blocked_id.eq.${session.callee_id}),and(blocker_id.eq.${session.callee_id},blocked_id.eq.${session.caller_id})`
        )
        .limit(1),
      admin
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('user_id', session.callee_id),
    ])

  if (!participation || participation.is_muted || participation.is_archived || blocks?.length) {
    return new Response(null, { status: 204 })
  }

  if (!subscriptions?.length) return new Response(null, { status: 204 })
  const { data: claimed, error: claimError } = await admin
    .from('call_sessions')
    .update({ push_sent_at: new Date().toISOString() })
    .eq('id', session.id)
    .is('push_sent_at', null)
    .in('status', ['pending', 'ringing'])
    .select('id')
    .maybeSingle()
  if (claimError)
    return Response.json({ error: 'Could not queue call notification' }, { status: 503 })
  if (!claimed) return new Response(null, { status: 204 })

  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
  const callerName = caller?.display_name || 'Chatly'
  const expiredSubscriptionIds: string[] = []
  let delivered = 0
  let transientFailures = 0

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

      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify({
            title: callerName,
            body: session.call_type === 'video' ? 'Cuộc gọi video đến' : 'Cuộc gọi thoại đến',
            tag: `call-${session.id}`,
            icon: caller?.avatar_url || '/icons/chatly-192.png',
            badge: '/icons/notification-badge.png',
            data: {
              type: 'call',
              expiresAt,
              sessionId: session.id,
              conversationId: session.conversation_id,
              url: `/chats/${session.conversation_id}?incomingCall=${session.id}`,
            },
          }),
          {
            TTL: Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000)),
            urgency: 'high',
            timeout: 10_000,
          }
        )
        delivered++
      } catch (error) {
        const statusCode =
          typeof error === 'object' && error !== null && 'statusCode' in error
            ? Number(error.statusCode)
            : 0
        if (statusCode === 404 || statusCode === 410) expiredSubscriptionIds.push(subscription.id)
        else transientFailures++
      }
    })
  )

  if (expiredSubscriptionIds.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', expiredSubscriptionIds)
  }

  if (!delivered && transientFailures > 0) {
    await admin.from('call_sessions').update({ push_sent_at: null }).eq('id', session.id)
    return Response.json({ error: 'Push delivery temporarily unavailable' }, { status: 503 })
  }

  return new Response(null, { status: 204 })
}
