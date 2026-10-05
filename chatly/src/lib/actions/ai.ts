'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  aiService,
  callN8n,
  encryptCredentials,
  encryptHeaderSecret,
  requireAiUser,
  validateChatUrl,
} from '@/lib/ai/server'
import { N8nError } from '@/lib/ai/protocol'
import { recordAssistantAudit } from '@/lib/assistant/server'

const agentSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500),
  welcome_message: z.string().trim().max(2000),
  avatar_url: z.union([z.literal(''), z.url().startsWith('https://').max(2000)]),
  enabled: z.boolean(),
  available_to_users: z.boolean(),
  is_default: z.boolean(),
  archived: z.boolean(),
  chat_url: z.union([z.literal(''), z.url().max(2000)]),
  auth_type: z.enum(['none', 'basic', 'header_secret']),
  auth_header_name: z.string().trim().max(100),
  protocol: z.enum(['chat', 'legacy']),
  timeout_ms: z.number().int().min(1000).max(120000),
  username: z
    .string()
    .max(200)
    .refine((value) => !value.includes(':')),
  password: z.string().max(1000),
  header_secret: z
    .string()
    .max(512)
    .refine((value) => !value || /^[\x21-\x7e]+$/.test(value)),
  clear_credentials: z.boolean(),
})

export async function saveAiAgent(input: z.input<typeof agentSchema>) {
  const { user } = await requireAiUser(true)
  const parsed = agentSchema.safeParse(input)
  if (!parsed.success) throw new Error('Vui lòng kiểm tra tên, URL và các trường cấu hình.')
  const value = parsed.data
  const id = value.id ?? randomUUID()
  let chatUrl = value.chat_url
  if (!chatUrl && value.id) {
    const { data } = await aiService()
      .from('ai_connections')
      .select('chat_url')
      .eq('agent_id', id)
      .single()
    chatUrl = data?.chat_url ?? ''
  }
  if (!chatUrl) throw new Error('Hãy nhập Production URL của workflow n8n.')
  const url = validateChatUrl(chatUrl)
  if (value.avatar_url) {
    const avatar = new URL(value.avatar_url)
    const storage = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!)
    if (
      !(avatar.origin === storage.origin && avatar.pathname.startsWith('/storage/v1/object/')) &&
      avatar.origin !== 'https://lh3.googleusercontent.com'
    ) {
      throw new Error(
        'Ảnh đại diện cần dùng URL Supabase Storage hoặc Google để phù hợp cấu hình ảnh của ứng dụng.'
      )
    }
  }
  if (value.auth_type === 'basic' && Boolean(value.username) !== Boolean(value.password)) {
    throw new Error('Hãy nhập cả tên đăng nhập và mật khẩu Basic Auth.')
  }
  if (
    value.auth_type === 'header_secret' &&
    (!/^[A-Za-z0-9-]{1,100}$/.test(value.auth_header_name) ||
      ['host', 'authorization', 'content-type', 'content-length', 'connection'].includes(
        value.auth_header_name.toLowerCase()
      ))
  )
    throw new Error('Tên header xác thực không hợp lệ.')
  const service = aiService()
  const { data: previous } = value.id
    ? await service
        .from('ai_connections')
        .select('auth_type, credentials')
        .eq('agent_id', id)
        .maybeSingle()
    : { data: null }
  const credentials =
    value.auth_type === 'basic' && value.username && value.password
      ? encryptCredentials(id, value.username, value.password)
      : value.auth_type === 'header_secret' && value.header_secret
        ? encryptHeaderSecret(id, value.header_secret)
        : null
  if (
    value.auth_type !== 'none' &&
    !credentials &&
    (value.clear_credentials || !previous?.credentials || previous.auth_type !== value.auth_type)
  ) {
    throw new Error('Hãy nhập thông tin xác thực cho kiểu kết nối đã chọn.')
  }
  if (value.is_default && (!value.enabled || !value.available_to_users || value.archived)) {
    throw new Error('Agent mặc định phải đang bật và hiển thị cho người dùng.')
  }
  const { error } = await service.rpc('save_ai_agent_v2', {
    p_id: id,
    p_name: value.name,
    p_description: value.description,
    p_welcome: value.welcome_message,
    p_avatar: value.avatar_url,
    p_enabled: value.enabled,
    p_available: value.available_to_users,
    p_default: value.is_default,
    p_archived: value.archived,
    p_url: url,
    p_auth_type: value.auth_type,
    p_auth_header: value.auth_header_name,
    p_protocol: value.protocol,
    p_timeout_ms: value.timeout_ms,
    p_credentials: credentials,
    p_replace_credentials:
      Boolean(credentials) || value.clear_credentials || value.auth_type === 'none',
  })
  if (error)
    throw new Error(
      error.message.includes('DEFAULT_AGENT_REQUIRED')
        ? 'Hãy chọn agent mặc định khác trước khi tắt hoặc lưu trữ agent này.'
        : 'Không lưu được agent. Kiểm tra cấu hình hoặc migration AI trên Supabase.'
    )
  await service.from('ai_agents').update({ legacy_connection_pending: false }).eq('id', id)
  try {
    await recordAssistantAudit(user.id, value.id ? 'ai_agent_updated' : 'ai_agent_created', {
      agent_id: id,
      auth_type: value.auth_type,
      protocol: value.protocol,
      is_default: value.is_default,
      enabled: value.enabled,
      available_to_users: value.available_to_users,
      archived: value.archived,
      endpoint_hostname: new URL(url).hostname,
    })
  } catch {
    console.error('ai_agent_audit_failed', { agentId: id })
  }
  revalidatePath('/admin/ai-agents')
  revalidatePath('/ai')
}

export async function testAiAgent(id: string) {
  const { user } = await requireAiUser(true)
  const agentId = z.uuid().parse(id)
  const started = Date.now()
  let code: string | null = null
  try {
    const result = await callN8n(
      agentId,
      `test:${randomUUID()}`,
      'Xin chào! Hãy trả lời ngắn để kiểm tra kết nối.',
      { requestId: randomUUID(), conversationId: randomUUID(), userId: user.id, role: 'ADMIN' }
    )
    return { reply: result.text }
  } catch (error) {
    code = error instanceof N8nError ? error.code : 'N8N_UNAVAILABLE'
    return { error: code }
  } finally {
    await aiService()
      .from('ai_connections')
      .update({
        last_tested_at: new Date().toISOString(),
        last_status: code ? 'failed' : 'connected',
        last_latency_ms: Date.now() - started,
        last_error_code: code,
      })
      .eq('agent_id', agentId)
    try {
      await recordAssistantAudit(
        user.id,
        code ? 'ai_agent_test_failed' : 'ai_agent_test_succeeded',
        { agent_id: agentId, error_code: code, latency_ms: Date.now() - started }
      )
    } catch {
      console.error('ai_agent_audit_failed', { agentId })
    }
  }
}

export async function createAiConversation(agentId: string) {
  const { user } = await requireAiUser()
  const service = aiService()
  const id = z.uuid().parse(agentId)
  const { data, error } = await service.rpc('create_ai_conversation', {
    p_user_id: user.id,
    p_agent_id: id,
  })
  if (error || !data) throw new Error('Không tạo được cuộc trò chuyện. Agent có thể đã tắt.')
  return data
}

export async function deleteAiConversation(conversationId: string) {
  const { user } = await requireAiUser()
  const id = z.uuid().parse(conversationId)
  const service = aiService()
  const { data, error } = await service.rpc('delete_ai_conversation', {
    p_user_id: user.id,
    p_conversation_id: id,
  })
  if (error || !data) {
    if (error?.message.includes('AI_CONVERSATION_ACTIVE')) {
      throw new Error('Hãy dừng phản hồi AI trước khi xóa cuộc trò chuyện.')
    }
    throw new Error('Không thể xóa cuộc trò chuyện AI.')
  }
  return id
}
