import 'server-only'

import { N8nError, postN8n, type N8nRequestOptions } from './protocol'
import { resolveWebhookAddress } from './transport'
import { createExecutionControl } from './execution-control'
import { buildAiHistory } from './history'

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { getServerAuth } from '@/lib/supabase/auth'
import type { Database } from '@/types'
import { decryptConnection } from '@/lib/assistant/crypto'

export async function requireAiUser(admin = false) {
  const { supabase, user } = await getServerAuth()
  if (!user) throw new Error('Vui lòng đăng nhập.')
  const { data, error } = await supabase.rpc('get_my_profile')
  const profile = data && typeof data === 'object' && !Array.isArray(data) ? data : null
  if (error || !profile || profile.is_suspended === true || (admin && profile.role !== 'admin')) {
    throw new Error('Bạn không có quyền thực hiện thao tác này.')
  }
  return { supabase, user, isAdmin: profile.role === 'admin' }
}

export function aiService() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!key || !url) throw new Error('Server chưa cấu hình kết nối AI với Supabase.')
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function encryptionKeys() {
  const keys = [process.env.AI_CONFIG_ENCRYPTION_KEY, process.env.AI_CREDENTIALS_KEY]
    .filter((value): value is string => Boolean(value))
    .map((value) => Buffer.from(value, 'base64'))
    .filter((value) => value.length === 32)
  if (!keys.length) throw new N8nError('N8N_CONFIGURATION')
  return keys
}

function encryptPayload(agentId: string, value: object) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKeys()[0], iv)
  cipher.setAAD(Buffer.from(agentId))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64')
}

export function encryptCredentials(agentId: string, username: string, password: string) {
  return encryptPayload(agentId, { username, password })
}

export function encryptHeaderSecret(agentId: string, secret: string) {
  return encryptPayload(agentId, { secret })
}

function decryptPayload(agentId: string, value: string): unknown {
  const bytes = Buffer.from(value, 'base64')
  for (const key of encryptionKeys()) {
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12))
      decipher.setAAD(Buffer.from(agentId))
      decipher.setAuthTag(bytes.subarray(12, 28))
      return JSON.parse(
        Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')
      )
    } catch {
      continue
    }
  }
  throw new N8nError('N8N_CONFIGURATION')
}

export function decryptCredentials(agentId: string, value: string) {
  const parsed = decryptPayload(agentId, value)
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('username' in parsed) ||
    !('password' in parsed) ||
    typeof parsed.username !== 'string' ||
    typeof parsed.password !== 'string'
  )
    throw new N8nError('N8N_CONFIGURATION')
  return parsed
}

export function decryptHeaderSecret(agentId: string, value: string) {
  const parsed = decryptPayload(agentId, value)
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('secret' in parsed) ||
    typeof parsed.secret !== 'string'
  )
    throw new N8nError('N8N_CONFIGURATION')
  return parsed.secret
}

export async function migrateLegacyDefaultConnection() {
  const service = aiService()
  const { data: agent } = await service
    .from('ai_agents')
    .select('id, legacy_connection_pending')
    .eq('is_default', true)
    .maybeSingle()
  if (!agent?.legacy_connection_pending) return
  const { data: existing } = await service
    .from('ai_connections')
    .select('agent_id')
    .eq('agent_id', agent.id)
    .maybeSingle()
  if (!existing) {
    const { data: legacy } = await service
      .from('chat_assistant_config')
      .select('connection_encrypted, timeout_ms')
      .eq('id', true)
      .single()
    if (!legacy?.connection_encrypted) throw new N8nError('N8N_CONFIGURATION')
    let connection: { url: string; secret: string }
    try {
      connection = decryptConnection(legacy.connection_encrypted)
    } catch {
      throw new N8nError('N8N_CONFIGURATION')
    }
    const { error } = await service.from('ai_connections').upsert(
      {
        agent_id: agent.id,
        chat_url: connection.url,
        credentials: encryptHeaderSecret(agent.id, connection.secret),
        auth_type: 'header_secret',
        auth_header_name: 'X-N8N-SECRET',
        protocol: 'legacy',
        timeout_ms: legacy.timeout_ms,
      },
      { onConflict: 'agent_id', ignoreDuplicates: true }
    )
    if (error) throw new N8nError('N8N_CONFIGURATION')
  }
  const { error: clearError } = await service
    .from('ai_agents')
    .update({ legacy_connection_pending: false })
    .eq('id', agent.id)
  if (clearError) throw new N8nError('N8N_CONFIGURATION')
}

export async function getDefaultAiAgent() {
  await migrateLegacyDefaultConnection()
  const { data: agent } = await aiService()
    .from('ai_agents')
    .select('*')
    .eq('is_default', true)
    .maybeSingle()
  if (!agent?.enabled || !agent.available_to_users || agent.archived_at) return null
  const { data: connection } = await aiService()
    .from('ai_connections')
    .select('agent_id')
    .eq('agent_id', agent.id)
    .maybeSingle()
  return connection ? agent : null
}

export function validateChatUrl(value: string) {
  const url = new URL(value)
  const allowed = (process.env.N8N_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  const localDevelopment =
    process.env.NODE_ENV === 'development' &&
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1'].includes(url.hostname)
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    (url.protocol !== 'https:' && !localDevelopment) ||
    url.username ||
    url.password ||
    url.hash ||
    (!allowed.includes(url.origin) && !localDevelopment) ||
    url.pathname === '/'
  ) {
    throw new Error(
      'Nhập Production URL đầy đủ của webhook n8n thuộc N8N_ALLOWED_ORIGINS. Localhost chỉ dùng khi chạy dev.'
    )
  }
  return url.toString()
}

export async function callN8n(
  agentId: string,
  sessionId: string,
  content: string,
  options: N8nRequestOptions = {}
) {
  const { data: connection, error } = await aiService()
    .from('ai_connections')
    .select('*')
    .eq('agent_id', agentId)
    .single()
  if (error || !connection) throw new N8nError('N8N_CONFIGURATION')
  let url: string
  try {
    url = validateChatUrl(connection.chat_url)
  } catch {
    throw new N8nError('N8N_CONFIGURATION')
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (connection.auth_type === 'basic' && connection.credentials) {
    const credentials = decryptCredentials(agentId, connection.credentials)
    headers.Authorization = `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`
  } else if (connection.auth_type === 'header_secret' && connection.credentials) {
    const header = connection.auth_header_name
    if (
      !/^[A-Za-z0-9-]{1,100}$/.test(header) ||
      ['host', 'authorization', 'content-type', 'content-length', 'connection'].includes(
        header.toLowerCase()
      )
    )
      throw new N8nError('N8N_CONFIGURATION')
    headers[header] = decryptHeaderSecret(agentId, connection.credentials)
  } else if (connection.auth_type !== 'none') {
    throw new N8nError('N8N_CONFIGURATION')
  }
  const timeout = AbortSignal.timeout(
    Math.min(connection.timeout_ms, options.timeoutMs ?? connection.timeout_ms)
  )
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout
  try {
    signal.throwIfAborted()
    let history = options.history
    if (options.channel && options.conversationId && options.userId) {
      const { data, error } = await aiService().rpc('get_completed_ai_history', {
        p_user_id: options.userId,
        p_conversation_id: options.conversationId,
        p_channel: options.channel,
      })
      if (error || !data) throw new N8nError('N8N_CONFIGURATION')
      history = buildAiHistory(data)
    }
    signal.throwIfAborted()
    const pinnedAddress = await resolveWebhookAddress(url, signal)
    return await postN8n(url, headers, sessionId, content, signal, {
      ...options,
      history,
      executionControl: createExecutionControl(agentId, url, options),
      protocol: connection.protocol,
      pinnedAddress,
    })
  } catch (error) {
    if (options.signal?.aborted) throw new N8nError('AI_CANCELLED')
    throw error
  }
}
