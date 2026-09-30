'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  aiService,
  callN8n,
  encryptCredentials,
  requireAiUser,
  validateChatUrl,
} from '@/lib/ai/server'

const agentSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500),
  welcome_message: z.string().trim().max(2000),
  avatar_url: z.union([z.literal(''), z.url().startsWith('https://').max(2000)]),
  enabled: z.boolean(),
  chat_url: z.url().max(2000),
  username: z
    .string()
    .max(200)
    .refine((value) => !value.includes(':')),
  password: z.string().max(1000),
  clear_credentials: z.boolean(),
})

export async function saveAiAgent(input: z.input<typeof agentSchema>) {
  await requireAiUser(true)
  const parsed = agentSchema.safeParse(input)
  if (!parsed.success) throw new Error('Vui lòng kiểm tra tên, URL và các trường cấu hình.')
  const value = parsed.data
  const id = value.id ?? randomUUID()
  const url = validateChatUrl(value.chat_url)
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
  if (Boolean(value.username) !== Boolean(value.password)) {
    throw new Error('Hãy nhập cả tên đăng nhập và mật khẩu Basic Auth.')
  }
  const credentials =
    value.username && value.password ? encryptCredentials(id, value.username, value.password) : null
  const { error } = await aiService().rpc('save_ai_agent', {
    p_id: id,
    p_name: value.name,
    p_description: value.description,
    p_welcome: value.welcome_message,
    p_avatar: value.avatar_url,
    p_enabled: value.enabled,
    p_url: url,
    p_credentials: credentials,
    p_replace_credentials: Boolean(credentials) || value.clear_credentials,
  })
  if (error) throw new Error('Không lưu được agent. Kiểm tra migration AI trên Supabase.')
  revalidatePath('/admin/ai-agents')
  revalidatePath('/ai')
}

export async function testAiAgent(id: string) {
  await requireAiUser(true)
  const agentId = z.uuid().parse(id)
  try {
    return {
      reply: await callN8n(
        agentId,
        `test:${randomUUID()}`,
        'Xin chào! Hãy trả lời ngắn để kiểm tra kết nối.'
      ),
    }
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message.startsWith('n8n')
          ? error.message
          : 'Không kết nối được n8n. Kiểm tra URL, allowlist, khóa mã hóa và Docker.',
    }
  }
}

export async function createAiConversation(agentId: string) {
  const { user } = await requireAiUser()
  const service = aiService()
  const id = z.uuid().parse(agentId)
  const { data: agent } = await service
    .from('ai_agents')
    .select('id')
    .eq('id', id)
    .eq('enabled', true)
    .single()
  if (!agent) throw new Error('Agent hiện không hoạt động.')
  const { data, error } = await service
    .from('ai_conversations')
    .insert({ user_id: user.id, agent_id: id })
    .select('id')
    .single()
  if (error || !data) throw new Error('Không tạo được cuộc trò chuyện.')
  return data.id
}
