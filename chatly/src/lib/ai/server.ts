import 'server-only'

import { postN8n } from './protocol'

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { getServerAuth } from '@/lib/supabase/auth'
import type { Database } from '@/types'

export async function requireAiUser(admin = false) {
  const { supabase, user } = await getServerAuth()
  if (!user) throw new Error('Vui lòng đăng nhập.')
  const { data, error } = await supabase
    .from('profiles')
    .select('role, is_suspended')
    .eq('id', user.id)
    .single()
  if (error || !data || data.is_suspended || (admin && data.role !== 'admin')) {
    throw new Error('Bạn không có quyền thực hiện thao tác này.')
  }
  return { supabase, user }
}

export function aiService() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!key || !url) throw new Error('Server chưa cấu hình kết nối AI với Supabase.')
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function encryptionKey() {
  const key = Buffer.from(process.env.AI_CREDENTIALS_KEY ?? '', 'base64')
  if (key.length !== 32) throw new Error('Server cần AI_CREDENTIALS_KEY dạng base64 32 byte.')
  return key
}

export function encryptCredentials(agentId: string, username: string, password: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  cipher.setAAD(Buffer.from(agentId))
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify({ username, password }), 'utf8'),
    cipher.final(),
  ])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64')
}

export function decryptCredentials(agentId: string, value: string) {
  const bytes = Buffer.from(value, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), bytes.subarray(0, 12))
  decipher.setAAD(Buffer.from(agentId))
  decipher.setAuthTag(bytes.subarray(12, 28))
  const parsed: unknown = JSON.parse(
    Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')
  )
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('username' in parsed) ||
    !('password' in parsed) ||
    typeof parsed.username !== 'string' ||
    typeof parsed.password !== 'string'
  )
    throw new Error('Thông tin xác thực không hợp lệ.')
  return parsed
}

export function validateChatUrl(value: string) {
  const url = new URL(value)
  const allowed = (process.env.N8N_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash ||
    !allowed.includes(url.origin)
  ) {
    throw new Error('Chat URL phải thuộc N8N_ALLOWED_ORIGINS được cấu hình trên server.')
  }
  return url.toString()
}

export async function callN8n(agentId: string, sessionId: string, content: string) {
  const { data: connection, error } = await aiService()
    .from('ai_connections')
    .select('*')
    .eq('agent_id', agentId)
    .single()
  if (error || !connection) throw new Error('Agent chưa có kết nối n8n.')
  const url = validateChatUrl(connection.chat_url)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (connection.credentials) {
    const credentials = decryptCredentials(agentId, connection.credentials)
    headers.Authorization = `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`
  }
  return postN8n(url, headers, sessionId, content)
}
