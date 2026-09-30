import Module, { createRequire } from 'node:module'
import { expect, test } from '@playwright/test'
import { randomBytes } from 'node:crypto'
import type { AssistantConfig } from '../src/lib/assistant/schema'
import { decryptConnection } from '../src/lib/assistant/crypto'

// Route tests run in Node, outside Next's server-only import condition.
const loadModule = createRequire(__filename)
const marker = loadModule.resolve('server-only')
const markerModule = new Module(marker)
markerModule.exports = {}
markerModule.loaded = true
markerModule.filename = marker
markerModule.paths = []
loadModule.cache[marker] = markerModule

const auth = loadModule('../src/lib/supabase/auth') as { getServerAuth: () => Promise<unknown> }
const originalAuth = auth.getServerAuth
const adminRoute = loadModule(
  '../src/app/api/admin/ai/route'
) as typeof import('../src/app/api/admin/ai/route')
const testRoute = loadModule(
  '../src/app/api/admin/ai/test/route'
) as typeof import('../src/app/api/admin/ai/test/route')
const messageRoute = loadModule(
  '../src/app/api/assistant/messages/route'
) as typeof import('../src/app/api/assistant/messages/route')
const service = loadModule('../src/lib/assistant/server') as {
  assistantDb: () => unknown
  loadConfig: () => Promise<AssistantConfig>
}
const originalDb = service.assistantDb
const originalConfig = service.loadConfig

test.afterEach(() => {
  auth.getServerAuth = originalAuth
  service.assistantDb = originalDb
  service.loadConfig = originalConfig
})

test('normal user gets 403 from every admin AI handler before service access', async () => {
  const profile = { role: 'user', is_suspended: false }
  const query = { select: () => query, eq: () => query, single: async () => ({ data: profile }) }
  auth.getServerAuth = async () => ({
    user: { id: '11111111-1111-4111-8111-111111111111' },
    supabase: { from: () => query },
  })
  const request = () =>
    new Request('https://chatly.example/api/admin/ai', {
      method: 'PUT',
      headers: { Origin: 'https://chatly.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin' }),
    })
  for (const response of [
    await adminRoute.GET(),
    await adminRoute.PUT(request()),
    await testRoute.POST(request()),
  ]) {
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'FORBIDDEN' })
  }
})

test('suspended admin cannot access AI settings', async () => {
  const query = {
    select: () => query,
    eq: () => query,
    single: async () => ({ data: { role: 'admin', is_suspended: true } }),
  }
  auth.getServerAuth = async () => ({ user: { id: 'admin' }, supabase: { from: () => query } })
  expect((await adminRoute.GET()).status).toBe(403)
})

test('admin saves encrypted connection, masks reads, preserves blank credentials and disables AI', async () => {
  process.env.AI_CONFIG_ENCRYPTION_KEY = randomBytes(32).toString('base64')
  process.env.N8N_ASSISTANT_ALLOWED_ORIGINS = 'https://n8n.example.test'
  const config: AssistantConfig = {
    id: true,
    name: 'Chatly AI',
    description: '',
    avatar_url: '',
    welcome_message: 'Hello',
    enabled: false,
    connection_encrypted: null,
    timeout_ms: 120000,
    last_connection_status: null,
    last_success_at: null,
    last_error: null,
    latency_ms: null,
    updated_at: '',
  }
  const query = {
    select: () => query,
    eq: () => query,
    single: async () => ({ data: { role: 'admin', is_suspended: false } }),
  }
  auth.getServerAuth = async () => ({ user: { id: 'admin' }, supabase: { from: () => query } })
  service.loadConfig = async () => ({ ...config })
  service.assistantDb = () => ({
    from: (table: string) => ({
      update: (value: Partial<AssistantConfig>) => {
        if (table === 'chat_assistant_config') Object.assign(config, value)
        return { eq: async () => ({ error: null }) }
      },
    }),
  })
  const profile = {
    name: 'Chatly AI',
    description: '',
    avatar_url: '',
    welcome_message: 'Hello',
    enabled: true,
    timeout_ms: 120000,
  }
  const put = (body: unknown) =>
    adminRoute.PUT(
      new Request('https://chatly.example/api/admin/ai', {
        method: 'PUT',
        headers: { Origin: 'https://chatly.example', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    )
  const secret = 'random-test-secret-value'
  const saved = await put({
    ...profile,
    webhookUrl: 'https://n8n.example.test/webhook/chat',
    webhookSecret: secret,
  })
  expect(saved.status).toBe(200)
  expect(decryptConnection(config.connection_encrypted!).secret).toBe(secret)
  expect(await saved.text()).not.toContain(secret)
  const read = await adminRoute.GET()
  const payload = await read.json()
  expect(payload.configured).toBe(true)
  expect(payload).not.toHaveProperty('connection_encrypted')
  expect(JSON.stringify(payload)).not.toContain('https://n8n')
  const encrypted = config.connection_encrypted
  expect((await put({ ...profile, enabled: false })).status).toBe(200)
  expect(config.enabled).toBe(false)
  expect(config.connection_encrypted).toBe(encrypted)
})

for (const scenario of ['human', 'other-owner', 'unauthenticated']) {
  test(`message route rejects ${scenario} before calling the gateway`, async () => {
    const userId = '11111111-1111-4111-8111-111111111111'
    const client = {
      from: (table: string) => {
        const data =
          table === 'profiles'
            ? { role: 'user', is_suspended: false }
            : table === 'conversations'
              ? { type: scenario === 'human' ? 'direct' : 'ai', created_by: 'another-user' }
              : scenario === 'other-owner'
                ? null
                : { user_id: userId }
        const query = { select: () => query, eq: () => query, single: async () => ({ data }) }
        return query
      },
    }
    auth.getServerAuth = async () => ({
      user: scenario === 'unauthenticated' ? null : { id: userId },
      supabase: client,
    })
    service.assistantDb = () => {
      throw new Error('Service must not be accessed')
    }
    const result = await messageRoute.POST(
      new Request('https://chatly.example/api/assistant/messages', {
        method: 'POST',
        headers: { Origin: 'https://chatly.example', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: '22222222-2222-4222-8222-222222222222',
          conversationId: '33333333-3333-4333-8333-333333333333',
          message: 'Hello',
        }),
      })
    )
    expect(result.status).toBe(scenario === 'unauthenticated' ? 401 : 403)
  })
}
