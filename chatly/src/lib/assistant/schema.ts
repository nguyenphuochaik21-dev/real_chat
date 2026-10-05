import { z } from 'zod'

export const messageInput = z
  .object({
    requestId: z.uuid(),
    conversationId: z.uuid(),
    message: z.string().trim().min(1).max(8000),
  })
  .strict()

export const assistantResponse = z.object({
  ok: z.literal(true),
  requestId: z.uuid(),
  conversationId: z.uuid(),
  assistant: z.object({
    text: z.string().trim().min(1).max(32000),
    format: z.enum(['text', 'markdown']),
    sources: z
      .array(
        z.object({
          title: z.string().max(300),
          url: z
            .url()
            .refine((value) => /^https?:\/\//i.test(value))
            .optional(),
          documentId: z.string().max(300).optional(),
          score: z.number().finite().optional(),
        })
      )
      .max(20)
      .optional(),
    attachments: z
      .array(
        z.object({
          type: z.enum(['image', 'audio', 'file', 'link']),
          url: z.url().refine((value) => value.startsWith('https://')),
          name: z.string().trim().min(1).max(300).optional(),
          title: z.string().trim().min(1).max(300).optional(),
          mimeType: z.string().trim().max(150).optional(),
          size: z.number().int().nonnegative().max(52_428_800).optional(),
          altText: z.string().trim().max(500).optional(),
        })
      )
      .max(12)
      .optional(),
  }),
})

export const configInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500),
    welcome_message: z.string().trim().max(2000),
    avatar_url: z.string().max(2000),
    enabled: z.boolean(),
    timeout_ms: z.number().int().min(1000).max(120000),
    webhookUrl: z.string().max(2048).optional(),
    webhookSecret: z
      .string()
      .min(16)
      .max(512)
      .regex(/^[\x21-\x7e]+$/)
      .optional(),
  })
  .strict()

export interface AssistantConfig {
  id: boolean
  name: string
  description: string
  avatar_url: string
  welcome_message: string
  enabled: boolean
  connection_encrypted: string | null
  timeout_ms: number
  last_connection_status: string | null
  last_success_at: string | null
  last_error: string | null
  latency_ms: number | null
  updated_at: string
}

export type AdminAssistantConfig = Omit<AssistantConfig, 'connection_encrypted'> & {
  configured: boolean
  secret_configured: boolean
  endpoint_hostname: string | null
  last_connection_test_at: string | null
  history: AssistantAuditEntry[]
}

export const assistantAuditActions = [
  'ai_config_updated',
  'ai_enabled',
  'ai_disabled',
  'ai_webhook_updated',
  'ai_connection_test_succeeded',
  'ai_connection_test_failed',
  'ai_agent_created',
  'ai_agent_updated',
  'ai_agent_test_succeeded',
  'ai_agent_test_failed',
] as const

export type AssistantAuditAction = (typeof assistantAuditActions)[number]

export interface AssistantAuditEntry {
  id: string
  admin_id: string | null
  action: AssistantAuditAction
  details: Record<string, unknown>
  created_at: string
}

export interface AiChatRequest {
  version: '1.0' | '1.1'
  event: 'chat.message.created' | 'connection.test'
  requestId: string
  conversation: { id: string }
  message: { id: string; text: string; createdAt: string; attachments?: [] }
  user: { id: string; role: 'USER' | 'ADMIN' }
  session: { id: string }
}

export type AiChatResponse = z.infer<typeof assistantResponse>
export interface AiChatGateway {
  sendMessage(input: AiChatRequest): Promise<AiChatResponse>
}
