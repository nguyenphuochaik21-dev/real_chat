import { createServer, request as httpRequest, type Server } from 'node:http'
import type { request as httpsRequest } from 'node:https'
import { randomBytes, randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { N8nChatGateway, isPublicIPv4, validateWebhook } from '../src/lib/assistant/gateway'
import { encryptConnection, decryptConnection } from '../src/lib/assistant/crypto'
import { messageInput, type AiChatRequest } from '../src/lib/assistant/schema'

let server: Server
let base: string
const input: AiChatRequest = {
  version: '1.0',
  event: 'chat.message.created',
  requestId: randomUUID(),
  conversation: { id: randomUUID() },
  session: { id: '' },
  message: { id: randomUUID(), text: 'Xin chào', createdAt: new Date().toISOString() },
  user: { id: randomUUID(), role: 'USER' },
}
input.session.id = input.conversation.id
const secret = 'test-secret-123456789'

test.beforeAll(async () => {
  process.env.N8N_ASSISTANT_ALLOWED_ORIGINS = 'https://n8n.example.test'
  process.env.AI_CONFIG_ENCRYPTION_KEY = randomBytes(32).toString('base64')
  server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    if (request.headers['x-n8n-secret'] !== secret) {
      response.writeHead(401).end()
      return
    }
    if (request.url === '/timeout') return
    if (request.url === '/500') {
      response.writeHead(500).end('sensitive details')
      return
    }
    if (request.url === '/redirect') {
      response.writeHead(302, { Location: `${base}/ok` }).end()
      return
    }
    if (request.url === '/invalid-json') {
      response.end('{')
      return
    }
    if (request.url === '/invalid-schema') {
      response.end('{"output":"wrong contract"}')
      return
    }
    if (request.url === '/large') {
      response.end('x'.repeat(270000))
      return
    }
    response.end(
      JSON.stringify({
        ok: true,
        requestId: request.url === '/mismatch' ? randomUUID() : body.requestId,
        conversationId: body.conversation.id,
        assistant: { text: JSON.stringify(body), format: 'markdown', sources: [] },
      })
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing server address')
  base = `http://127.0.0.1:${address.port}`
})

test.afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

function gateway(path: string, timeout = 1000) {
  return new N8nChatGateway(`https://n8n.example.test${path}`, secret, timeout, {
    resolve: async () => ({ address: '8.8.8.8', family: 4 }),
    request: ((
      url: URL,
      options: Parameters<typeof httpRequest>[1],
      callback: Parameters<typeof httpRequest>[2]
    ) => {
      return httpRequest(`${base}${url.pathname}`, { ...options, lookup: undefined }, callback)
    }) as typeof httpsRequest,
  })
}

test('authenticated n8n request preserves IDs and stable conversation session', async () => {
  const reply = await gateway('/ok').sendMessage(input)
  expect(JSON.parse(reply.assistant.text)).toEqual(input)
  expect(reply.requestId).toBe(input.requestId)
})

for (const [path, code] of [
  ['/timeout', 'N8N_TIMEOUT'],
  ['/500', 'N8N_UNAVAILABLE'],
  ['/redirect', 'N8N_UNAVAILABLE'],
  ['/invalid-json', 'N8N_INVALID_RESPONSE'],
  ['/invalid-schema', 'N8N_INVALID_RESPONSE'],
  ['/mismatch', 'N8N_INVALID_RESPONSE'],
  ['/large', 'N8N_INVALID_RESPONSE'],
])
  test(`n8n ${path} returns sanitized ${code}`, async () => {
    await expect(gateway(path, 100).sendMessage(input)).rejects.toThrow(code)
  })

test('URL allowlist and resolved addresses reject SSRF', async () => {
  for (const url of [
    'http://n8n.example.test/chat',
    'https://evil.test/chat',
    'https://user:pass@n8n.example.test/chat',
    'https://127.0.0.1/chat',
    'file:///etc/passwd',
    'https://n8n.example.test/chat#fragment',
  ]) {
    expect(() => validateWebhook(url)).toThrow()
  }
  for (const address of [
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '192.168.1.1',
    '172.16.0.1',
    '100.64.0.1',
    '::1',
  ]) {
    expect(isPublicIPv4(address)).toBe(false)
  }
  const target = new N8nChatGateway('https://n8n.example.test/ok', secret, 100, {
    resolve: async () => ({ address: '127.0.0.1', family: 4 }),
    request: httpRequest as typeof httpsRequest,
  })
  await expect(target.sendMessage(input)).rejects.toThrow('INVALID_WEBHOOK')
})

test('credentials are authenticated encrypted and tampering fails', () => {
  const connection = { url: 'https://n8n.example.test/secret-path', secret }
  const encrypted = encryptConnection(connection)
  expect(encrypted).not.toContain(secret)
  expect(decryptConnection(encrypted)).toEqual(connection)
  const bytes = Buffer.from(encrypted, 'base64')
  bytes[30] ^= 1
  expect(() => decryptConnection(bytes.toString('base64'))).toThrow()
})

test('input rejects empty, oversized and spoofed fields', () => {
  const valid = {
    requestId: input.requestId,
    conversationId: input.conversation.id,
    message: 'hello',
  }
  expect(messageInput.safeParse(valid).success).toBe(true)
  for (const invalid of [
    { ...valid, message: ' ' },
    { ...valid, message: 'x'.repeat(8001) },
    { ...valid, webhookUrl: 'https://evil.test' },
    { ...valid, userId: randomUUID() },
    { ...valid, role: 'ADMIN' },
  ]) {
    expect(messageInput.safeParse(invalid).success).toBe(false)
  }
})

test('unauthenticated APIs reject access and cross-origin writes fail', async ({
  request,
  baseURL,
}) => {
  expect((await request.get('/api/admin/ai')).status()).toBe(401)
  expect((await request.get('/api/assistant')).status()).toBe(401)
  expect(
    (
      await request.post('/api/assistant/messages', {
        headers: { Origin: new URL(baseURL!).origin },
        data: {},
      })
    ).status()
  ).toBe(401)
  expect(
    (
      await request.post('/api/assistant/messages', {
        headers: { Origin: 'https://evil.test' },
        data: {},
      })
    ).status()
  ).toBe(403)
})
