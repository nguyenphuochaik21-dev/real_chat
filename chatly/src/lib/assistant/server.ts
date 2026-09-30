import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { getServerAuth } from '@/lib/supabase/auth'
import type { Database } from '@/types'
import { decryptConnection } from './crypto'
import { N8nChatGateway } from './gateway'
import type { AssistantConfig, AiChatRequest } from './schema'

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

export async function loadConfig() {
  const { data, error } = await assistantDb()
    .from('chat_assistant_config')
    .select('*')
    .eq('id', true)
    .single()
  if (error || !data) throw new AssistantError('AI_NOT_CONFIGURED', 503)
  return data
}

export function publicConfig(config: AssistantConfig) {
  return {
    name: config.name,
    description: config.description,
    avatar_url: config.avatar_url,
    welcome_message: config.welcome_message,
    enabled: config.enabled,
  }
}

export function adminConfig(config: AssistantConfig) {
  const { connection_encrypted, ...safe } = config
  return { ...safe, configured: Boolean(connection_encrypted) }
}

export async function invokeAssistant(config: AssistantConfig, input: AiChatRequest) {
  if (!config.connection_encrypted) throw new AssistantError('AI_NOT_CONFIGURED', 503)
  const started = Date.now()
  let status = 'CONNECTED'
  let errorCode: string | null = null
  try {
    const connection = decryptConnection(config.connection_encrypted)
    return await new N8nChatGateway(
      connection.url,
      connection.secret,
      config.timeout_ms
    ).sendMessage(input)
  } catch (error) {
    errorCode =
      error instanceof Error &&
      ['N8N_TIMEOUT', 'N8N_UNAVAILABLE', 'N8N_INVALID_RESPONSE', 'INVALID_WEBHOOK'].includes(
        error.message
      )
        ? error.message
        : 'INTERNAL_ERROR'
    status =
      errorCode === 'N8N_TIMEOUT'
        ? 'TIMEOUT'
        : errorCode === 'N8N_INVALID_RESPONSE'
          ? 'INVALID_RESPONSE'
          : 'FAILED'
    throw new AssistantError(errorCode, errorCode === 'N8N_TIMEOUT' ? 504 : 502)
  } finally {
    const latency = Date.now() - started
    await assistantDb()
      .from('chat_assistant_config')
      .update({
        last_connection_status: status,
        last_error: errorCode,
        latency_ms: latency,
        ...(status === 'CONNECTED' ? { last_success_at: new Date().toISOString() } : {}),
      })
      .eq('id', true)
    console.info('chat_assistant_request', {
      requestId: input.requestId,
      conversationId: input.conversation.id,
      latencyMs: latency,
      status,
      errorCode,
    })
  }
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
