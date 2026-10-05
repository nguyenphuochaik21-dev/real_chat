import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { getServerAuth } from '@/lib/supabase/auth'
import type { Database, Json } from '@/types'
import type { AssistantAuditAction } from './schema'

export class AssistantError extends Error {
  constructor(
    public code: string,
    public status = 400
  ) {
    super(code)
  }
}

export async function requireAssistantUser(admin = false) {
  const { supabase, user } = await getServerAuth()
  if (!user) throw new AssistantError('UNAUTHENTICATED', 401)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_suspended')
    .eq('id', user.id)
    .single()
  if (!profile || profile.is_suspended || (admin && profile.role !== 'admin')) {
    throw new AssistantError('FORBIDDEN', 403)
  }
  return { supabase, user, role: profile.role === 'admin' ? ('ADMIN' as const) : ('USER' as const) }
}

export function assistantDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new AssistantError('INTERNAL_ERROR', 503)
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function sanitizeAuditDetails(value: Json | undefined): Json {
  if (value === undefined) return null
  if (Array.isArray(value)) return value.map(sanitizeAuditDetails)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/(secret|cipher|encrypted|webhook_url)/i.test(key))
        .map(([key, entry]) => [key, sanitizeAuditDetails(entry)])
    )
  }
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) return '[redacted]'
  return value
}

export async function recordAssistantAudit(
  adminId: string,
  action: AssistantAuditAction,
  details: Record<string, Json> = {}
) {
  const { error } = await assistantDb()
    .from('admin_audit_logs')
    .insert({
      admin_id: adminId,
      target_user_id: null,
      action,
      details: sanitizeAuditDetails(details),
    })
  if (error) throw new AssistantError('INTERNAL_ERROR', 500)
}

export function checkOrigin(request: Request) {
  const expected = new URL(request.url)
  const host = request.headers.get('host')
  if (host) expected.host = host
  if (request.headers.get('origin') !== expected.origin) {
    throw new AssistantError('FORBIDDEN', 403)
  }
}

export async function readBody(request: Request) {
  const reader = request.body?.getReader()
  if (!reader) throw new AssistantError('INVALID_MESSAGE')
  let bytes = 0
  const chunks: Uint8Array[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.length
    if (bytes > 40000) {
      await reader.cancel()
      throw new AssistantError('PAYLOAD_TOO_LARGE', 413)
    }
    chunks.push(value)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new AssistantError('INVALID_MESSAGE')
  }
}

export function errorResponse(error: unknown) {
  const code = error instanceof AssistantError ? error.code : 'INTERNAL_ERROR'
  return Response.json(
    { error: code },
    { status: error instanceof AssistantError ? error.status : 500 }
  )
}
