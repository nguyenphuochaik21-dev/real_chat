import { createClient as createAdminClient } from '@supabase/supabase-js'
import webPush from 'web-push'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { isAllowedPushEndpoint } from '@/lib/push-endpoint'
import type { Database } from '@/types'

export const runtime = 'nodejs'

const requestSchema = z.object({
  requestId: z.string().uuid(),
  event: z.enum(['created', 'updated']),
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

  const admin = createAdminClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const [{ data: ticket }, { data: actor }] = await Promise.all([
    admin
      .from('support_requests')
      .select(
        'id, user_id, assigned_admin_id, category, status, admin_response, admin_push_sent_at, user_push_sent_at'
      )
      .eq('id', values.data.requestId)
      .maybeSingle(),
    admin.from('profiles').select('role, is_suspended').eq('id', user.id).maybeSingle(),
  ])
  if (!ticket) return Response.json({ error: 'Support request not found' }, { status: 404 })

  let recipientIds: string[] = []
  if (values.data.event === 'created') {
    if (ticket.user_id !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403 })
    if (actor?.is_suspended) return Response.json({ error: 'Forbidden' }, { status: 403 })
    if (ticket.assigned_admin_id) {
      recipientIds = [ticket.assigned_admin_id]
    } else {
      const { data: admins } = await admin
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
        .eq('is_suspended', false)
      recipientIds = (admins ?? []).map((profile) => profile.id)
    }
  } else {
    if (actor?.role !== 'admin' || actor.is_suspended) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    recipientIds = [ticket.user_id]
  }

  if (recipientIds.length === 0) return new Response(null, { status: 204 })

  const pushSentAt = new Date().toISOString()
  const claimResult =
    values.data.event === 'created'
      ? await admin
          .from('support_requests')
          .update({ admin_push_sent_at: pushSentAt })
          .eq('id', ticket.id)
          .is('admin_push_sent_at', null)
          .select('id')
          .maybeSingle()
      : await admin
          .from('support_requests')
          .update({ user_push_sent_at: pushSentAt })
          .eq('id', ticket.id)
          .is('user_push_sent_at', null)
          .select('id')
          .maybeSingle()

  if (claimResult.error) {
    return Response.json({ error: 'Unable to queue notification' }, { status: 500 })
  }
  if (!claimResult.data) return new Response(null, { status: 204 })

  const { data: subscriptions } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', recipientIds)

  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
  const isCreated = values.data.event === 'created'
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

      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          JSON.stringify({
            title: isCreated ? 'Yêu cầu hỗ trợ mới' : 'Quản trị viên đã phản hồi',
            body: isCreated
              ? `Chủ đề: ${ticket.category}`
              : ticket.admin_response?.slice(0, 160) || `Trạng thái: ${ticket.status}`,
            tag: `support-${ticket.id}`,
            icon: '/icons/chatly-192.png',
            badge: '/icons/notification-badge.png',
            data: {
              type: 'support',
              requestId: ticket.id,
              url: isCreated
                ? `/admin#support-${ticket.id}`
                : `/settings/support#support-${ticket.id}`,
            },
          }),
          { TTL: 3_600, urgency: 'high' }
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
