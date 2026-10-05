import Module, { createRequire } from 'node:module'
import { expect, test } from '@playwright/test'

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
const service = loadModule('../src/lib/assistant/server') as { assistantDb: () => unknown }
const originalDb = service.assistantDb

test.afterEach(() => {
  auth.getServerAuth = originalAuth
  service.assistantDb = originalDb
})

function stubUser(role: string, suspended = false) {
  const query = {
    select: () => query,
    eq: () => query,
    single: async () => ({ data: { role, is_suspended: suspended } }),
  }
  auth.getServerAuth = async () => ({
    user: { id: '11111111-1111-4111-8111-111111111111' },
    supabase: { from: () => query },
  })
}

function adminRequest() {
  return new Request('https://chatly.example/api/admin/ai', {
    method: 'PUT',
    headers: { Origin: 'https://chatly.example' },
  })
}

test('legacy admin API rejects ordinary and suspended users', async () => {
  for (const [role, suspended] of [
    ['user', false],
    ['admin', true],
  ] as const) {
    stubUser(role, suspended)
    for (const response of [
      await adminRoute.GET(),
      await adminRoute.PUT(adminRequest()),
      await testRoute.POST(adminRequest()),
    ]) {
      expect(response.status).toBe(403)
      expect(await response.json()).toEqual({ error: 'FORBIDDEN' })
    }
  }
})

test('legacy admin API cannot mutate a second AI configuration', async () => {
  stubUser('admin')
  for (const response of [
    await adminRoute.GET(),
    await adminRoute.PUT(adminRequest()),
    await testRoute.POST(adminRequest()),
  ]) {
    expect(response.status).toBe(410)
    expect(await response.json()).toEqual({ error: 'MOVED_TO_AI_AGENTS' })
  }
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
