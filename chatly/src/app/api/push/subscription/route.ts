import { createClient as createAdminClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { isAllowedPushEndpoint } from '@/lib/push-endpoint'
import type { Database } from '@/types'

const endpointSchema = z.url().max(4_000).refine(isAllowedPushEndpoint, 'Unsupported push endpoint')
const subscriptionSchema = z.object({
  endpoint: endpointSchema,
  p256dh: z.string().min(1).max(500),
  auth: z.string().min(1).max(500),
})

const removeSchema = z.object({ endpoint: endpointSchema })

export async function POST(request: Request) {
  const values = subscriptionSchema.safeParse(await request.json().catch(() => null))
  if (!values.success) return Response.json({ error: 'Invalid subscription' }, { status: 400 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const record = {
    user_id: user.id,
    ...values.data,
    updated_at: new Date().toISOString(),
  }
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const database =
    serviceRoleKey && supabaseUrl
      ? createAdminClient<Database>(supabaseUrl, serviceRoleKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : supabase

  const endpointResult = await database
    .from('push_subscriptions')
    .upsert(record, { onConflict: 'endpoint' })
  if (!endpointResult.error) return new Response(null, { status: 204 })

  const legacyResult = await database
    .from('push_subscriptions')
    .upsert(record, { onConflict: 'user_id' })
  if (legacyResult.error) {
    return Response.json({ error: 'Could not save subscription' }, { status: 500 })
  }
  return new Response(null, { status: 204 })
}

export async function DELETE(request: Request) {
  const values = removeSchema.safeParse(await request.json().catch(() => null))
  if (!values.success) return Response.json({ error: 'Invalid subscription' }, { status: 400 })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', values.data.endpoint)
  if (error) return Response.json({ error: 'Could not remove subscription' }, { status: 500 })
  return new Response(null, { status: 204 })
}
