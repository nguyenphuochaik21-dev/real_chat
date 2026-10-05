import { z } from 'zod'
import { N8nError } from './errors'
import { requestPinnedWebhook } from './transport'
export { N8nError } from './errors'
export type { N8nErrorCode } from './errors'

const outputAttachmentSchema = z.object({
  type: z.enum(['image', 'audio', 'file', 'link']),
  url: z.url().refine((value) => value.startsWith('https://')),
  name: z.string().trim().min(1).max(300).optional(),
  title: z.string().trim().min(1).max(300).optional(),
  mimeType: z.string().trim().max(150).optional(),
  size: z.number().int().nonnegative().max(52_428_800).optional(),
  altText: z.string().trim().max(500).optional(),
})

export type AiOutputAttachment = z.infer<typeof outputAttachmentSchema>

export type AiHistoryMessage = { role: 'user' | 'assistant'; content: string }

export interface N8nAiResult {
  text: string
  attachments: AiOutputAttachment[]
  sources: { title: string; url?: string; documentId?: string; score?: number }[]
  format: 'text' | 'markdown'
  requestId?: string
  conversationId?: string
}

export type N8nRequestOptions = {
  history?: AiHistoryMessage[]
  channel?: 'assistant' | 'agent'
  executionControl?: { registerUrl: string; token: string }
  signal?: AbortSignal
  protocol?: 'chat' | 'legacy'
  requestId?: string
  conversationId?: string
  userId?: string
  role?: 'USER' | 'ADMIN'
  timeoutMs?: number
  pinnedAddress?: string
}

const sourceSchema = z.object({
  title: z.string().max(300),
  url: z
    .url()
    .refine((value) => /^https?:\/\//i.test(value))
    .optional(),
  documentId: z.string().max(300).optional(),
  score: z.number().finite().optional(),
})

export function parseN8nResponse(body: string): N8nAiResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new N8nError('N8N_INVALID_RESPONSE')
  }
  const item: unknown = Array.isArray(parsed) && parsed.length === 1 ? parsed[0] : parsed
  if (!item || typeof item !== 'object') throw new N8nError('N8N_INVALID_RESPONSE')
  if ('ok' in item && item.ok === false) throw new N8nError('N8N_WORKFLOW_ERROR')
  const assistant =
    'assistant' in item && item.assistant && typeof item.assistant === 'object'
      ? item.assistant
      : null
  const text =
    'text' in item && typeof item.text === 'string'
      ? item.text
      : 'output' in item && typeof item.output === 'string'
        ? item.output
        : assistant && 'text' in assistant && typeof assistant.text === 'string'
          ? assistant.text
          : null
  if (!text?.trim() || text.length > 32000) throw new N8nError('N8N_INVALID_RESPONSE')
  const rawAttachments =
    assistant && 'attachments' in assistant
      ? assistant.attachments
      : 'attachments' in item
        ? item.attachments
        : []
  const rawSources = assistant && 'sources' in assistant ? assistant.sources : []
  const attachments = z.array(outputAttachmentSchema).max(12).safeParse(rawAttachments)
  const sources = z.array(sourceSchema).max(20).safeParse(rawSources)
  if (!attachments.success || !sources.success) throw new N8nError('N8N_INVALID_RESPONSE')
  return {
    text: text.trim(),
    attachments: attachments.data,
    sources: sources.data,
    format:
      assistant && 'format' in assistant && assistant.format === 'markdown' ? 'markdown' : 'text',
    requestId:
      'requestId' in item && typeof item.requestId === 'string' ? item.requestId : undefined,
    conversationId:
      'conversationId' in item && typeof item.conversationId === 'string'
        ? item.conversationId
        : undefined,
  }
}

export async function postN8n(
  url: string,
  headers: Record<string, string>,
  sessionId: string,
  content: string,
  signal: AbortSignal = AbortSignal.timeout(55_000),
  options: N8nRequestOptions = {}
): Promise<N8nAiResult> {
  const body =
    options.protocol === 'legacy'
      ? {
          version: '1.0',
          event: 'chat.message.created',
          requestId: options.requestId,
          conversation: { id: options.conversationId },
          session: { id: sessionId },
          message: {
            id: options.requestId,
            text: content,
            createdAt: new Date().toISOString(),
          },
          user: { id: options.userId, role: options.role ?? 'USER' },
        }
      : {
          version: '1.1',
          action: 'sendMessage',
          requestId: options.requestId,
          conversationId: options.conversationId,
          sessionId,
          chatInput: content,
          attachments: [],
        }
  if (options.executionControl) {
    Object.assign(body, { chatlyControl: options.executionControl })
  }
  if (options.history) Object.assign(body, { history: options.history })
  if (
    options.protocol === 'legacy' &&
    (!options.requestId || !options.conversationId || !options.userId)
  ) {
    throw new N8nError('N8N_CONFIGURATION')
  }
  let response: Response
  try {
    response = options.pinnedAddress
      ? await requestPinnedWebhook(
          url,
          options.pinnedAddress,
          headers,
          JSON.stringify(body),
          signal
        )
      : await fetch(url, {
          method: 'POST',
          headers,
          redirect: 'error',
          cache: 'no-store',
          signal,
          body: JSON.stringify(body),
        })
  } catch (error) {
    if (error instanceof N8nError) throw error
    if (signal.aborted || (error instanceof Error && error.name === 'TimeoutError')) {
      throw new N8nError('N8N_TIMEOUT')
    }
    throw new N8nError('N8N_UNAVAILABLE')
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new N8nError(
      response.status === 401 || response.status === 403
        ? 'N8N_AUTH_FAILED'
        : response.status === 404
          ? 'N8N_CONFIGURATION'
          : response.status >= 300 && response.status < 400
            ? 'N8N_CONFIGURATION'
            : response.status === 504
              ? 'N8N_TIMEOUT'
              : response.status === 502 || response.status === 503
                ? 'N8N_UNAVAILABLE'
                : 'N8N_WORKFLOW_ERROR'
    )
  }
  const reader = response.body?.getReader()
  if (!reader) throw new N8nError('N8N_INVALID_RESPONSE')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 256_000) throw new N8nError('N8N_INVALID_RESPONSE')
      chunks.push(value)
    }
  } catch (error) {
    if (error instanceof N8nError) throw error
    throw new N8nError(signal.aborted ? 'N8N_TIMEOUT' : 'N8N_UNAVAILABLE')
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  const result = parseN8nResponse(Buffer.concat(chunks).toString('utf8'))
  if (
    options.protocol === 'legacy' &&
    (result.requestId !== options.requestId || result.conversationId !== options.conversationId)
  ) {
    throw new N8nError('N8N_INVALID_RESPONSE')
  }
  return result
}
