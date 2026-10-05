import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { N8nRequestOptions } from './protocol'

const tokenSchema = z.object({
  requestId: z.uuid(),
  conversationId: z.uuid(),
  userId: z.uuid(),
  agentId: z.uuid(),
  apiUrl: z.url(),
  channel: z.enum(['assistant', 'agent']),
  expires: z.number().int(),
})
export type ExecutionIdentity = z.infer<typeof tokenSchema>

function signingKey() {
  const key = Buffer.from(process.env.AI_CONFIG_ENCRYPTION_KEY ?? '', 'base64')
  if (key.length !== 32) throw new Error('N8N_CONTROL_CONFIGURATION')
  return key
}

function signature(payload: string) {
  return createHmac('sha256', signingKey()).update(`chatly-execution:${payload}`).digest()
}

export function executionApiConfig() {
  const key = process.env.N8N_API_KEY
  const value = process.env.N8N_API_URL
  if (!key || !value) return null
  const url = new URL(value)
  const local =
    process.env.NODE_ENV === 'development' &&
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1'].includes(url.hostname)
  if (
    (url.protocol !== 'https:' && !local) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.replace(/\/$/, '').endsWith('/api/v1')
  )
    throw new Error('N8N_CONTROL_CONFIGURATION')
  return { key, url: url.toString().replace(/\/$/, ''), origin: url.origin }
}

export function createExecutionControl(
  agentId: string,
  webhookUrl: string,
  options: N8nRequestOptions
) {
  const config = executionApiConfig()
  const registerUrl = process.env.N8N_CHATLY_CALLBACK_URL
  if (!config || !registerUrl || config.origin !== new URL(webhookUrl).origin) return undefined
  if (!options.channel || !options.requestId || !options.conversationId || !options.userId)
    return undefined
  const callback = new URL(registerUrl)
  const local =
    process.env.NODE_ENV === 'development' &&
    callback.protocol === 'http:' &&
    ['localhost', '127.0.0.1', 'host.docker.internal'].includes(callback.hostname)
  if (
    (callback.protocol !== 'https:' && !local) ||
    callback.username ||
    callback.password ||
    callback.search ||
    callback.hash ||
    callback.pathname !== '/api/ai/executions'
  )
    throw new Error('N8N_CONTROL_CONFIGURATION')
  const identity: ExecutionIdentity = {
    requestId: options.requestId,
    conversationId: options.conversationId,
    userId: options.userId,
    agentId,
    apiUrl: config.url,
    channel: options.channel,
    expires: Math.floor(Date.now() / 1000) + 600,
  }
  const payload = Buffer.from(JSON.stringify(identity)).toString('base64url')
  return {
    registerUrl: callback.toString(),
    token: `${payload}.${signature(payload).toString('base64url')}`,
  }
}

export function verifyExecutionToken(value: string): ExecutionIdentity {
  if (value.length > 2000) throw new Error('INVALID_EXECUTION_TOKEN')
  const [payload, mac, extra] = value.split('.')
  if (!payload || !mac || extra) throw new Error('INVALID_EXECUTION_TOKEN')
  const received = Buffer.from(mac, 'base64url')
  const expected = signature(payload)
  if (received.length !== expected.length || !timingSafeEqual(received, expected))
    throw new Error('INVALID_EXECUTION_TOKEN')
  const identity = tokenSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')))
  if (identity.expires < Math.floor(Date.now() / 1000)) throw new Error('EXPIRED_EXECUTION_TOKEN')
  return identity
}
