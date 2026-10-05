import { createServer, type Server } from 'node:http'
import { expect, test } from '@playwright/test'
import { postN8n } from '../src/lib/ai/protocol'
import { resolveWebhookAddress } from '../src/lib/ai/transport'

let server: Server
let base: string
test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    response.setHeader('Content-Type', 'application/json')
    if (request.url === '/redirect') {
      response.writeHead(302, { Location: `${base}/ok` }).end()
    } else if (request.url === '/unauthorized') {
      response.writeHead(401).end('private upstream detail')
    } else if (request.url === '/offline') {
      response.writeHead(503).end('private upstream detail')
    } else if (request.url === '/server-error') {
      response.writeHead(500).end('private model detail')
    } else if (request.url === '/slow') {
      await new Promise((resolve) => setTimeout(resolve, 100))
      response.end(JSON.stringify({ text: 'Late reply' }))
    } else if (request.url === '/oversize') {
      response.end(JSON.stringify({ output: 'x'.repeat(140000) }))
    } else if (request.url === '/malformed') {
      response.end(JSON.stringify({ unrelated: 'not a reply' }))
    } else if (request.url === '/invalid-json') {
      response.end('{broken')
    } else if (request.url === '/legacy') {
      response.end(
        JSON.stringify({
          ok: true,
          requestId: body.requestId,
          conversationId: body.conversation.id,
          assistant: { text: JSON.stringify(body), format: 'markdown', sources: [] },
        })
      )
    } else if (request.url === '/model-error') {
      response.end(JSON.stringify({ ok: false, error: 'MODEL_FAILURE' }))
    } else if (request.url === '/text') {
      response.end(JSON.stringify([{ text: 'Xin chào' }]))
    } else if (request.url === '/assistant-only') {
      response.end(JSON.stringify({ assistant: { text: 'Nested reply' } }))
    } else {
      response.end(
        JSON.stringify({
          output: JSON.stringify({
            body,
            auth: request.headers.authorization,
            headerSecret: request.headers['x-n8n-secret'],
          }),
          attachments: [
            {
              type: 'file',
              url: 'https://files.example.com/report.pdf',
              name: 'report.pdf',
            },
          ],
        })
      )
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No test server address')
  base = `http://127.0.0.1:${address.port}`
})
test.afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

test('n8n receives chat protocol and server authentication', async () => {
  const reply = await postN8n(
    `${base}/ok`,
    { Authorization: 'Basic test' },
    'isolated-session',
    'Câu hỏi'
  )
  expect(JSON.parse(reply.text)).toEqual({
    auth: 'Basic test',
    body: {
      version: '1.1',
      action: 'sendMessage',
      sessionId: 'isolated-session',
      chatInput: 'Câu hỏi',
      attachments: [],
    },
  })
  expect(reply.attachments).toEqual([
    {
      type: 'file',
      url: 'https://files.example.com/report.pdf',
      name: 'report.pdf',
    },
  ])
  expect((await postN8n(`${base}/text`, {}, 'session', 'hello')).text).toBe('Xin chào')
  expect((await postN8n(`${base}/assistant-only`, {}, 'session', 'hello')).text).toBe(
    'Nested reply'
  )
})

test('n8n rejects redirects, oversized and malformed replies without leaking upstream body', async () => {
  await expect(postN8n(`${base}/redirect`, {}, 's', 'hello')).rejects.toThrow()
  await expect(postN8n(`${base}/oversize`, {}, 's', 'hello')).rejects.toThrow(
    'N8N_INVALID_RESPONSE'
  )
  await expect(postN8n(`${base}/malformed`, {}, 's', 'hello')).rejects.toThrow(
    'N8N_INVALID_RESPONSE'
  )
  await expect(postN8n(`${base}/invalid-json`, {}, 's', 'hello')).rejects.toThrow(
    'N8N_INVALID_RESPONSE'
  )
  await expect(postN8n(`${base}/unauthorized`, {}, 's', 'hello')).rejects.toThrow('N8N_AUTH_FAILED')
  await expect(postN8n(`${base}/offline`, {}, 's', 'hello')).rejects.toThrow('N8N_UNAVAILABLE')
  await expect(postN8n(`${base}/model-error`, {}, 's', 'hello')).rejects.toThrow(
    'N8N_WORKFLOW_ERROR'
  )
  await expect(postN8n(`${base}/server-error`, {}, 's', 'hello')).rejects.toThrow(
    'N8N_WORKFLOW_ERROR'
  )
  await expect(postN8n(`${base}/slow`, {}, 's', 'hello', AbortSignal.timeout(20))).rejects.toThrow(
    'N8N_TIMEOUT'
  )
  await expect(postN8n(`${base}/ok`, {}, 's', 'hello', AbortSignal.abort())).rejects.toThrow(
    'N8N_TIMEOUT'
  )
})

test('legacy assistant response and request remain compatible', async () => {
  const result = await postN8n(
    `${base}/legacy`,
    { 'X-N8N-SECRET': 'test' },
    'session',
    'hello',
    undefined,
    {
      protocol: 'legacy',
      requestId: '11111111-1111-4111-8111-111111111111',
      conversationId: '22222222-2222-4222-8222-222222222222',
      userId: '33333333-3333-4333-8333-333333333333',
    }
  )
  expect(JSON.parse(result.text)).toMatchObject({
    version: '1.0',
    event: 'chat.message.created',
    message: { text: 'hello' },
    session: { id: 'session' },
  })
  expect(result.sources).toEqual([])
})

test('pinned transport sends header authentication and blocks private network targets', async () => {
  const reply = await postN8n(
    `${base}/ok`,
    { 'X-N8N-SECRET': 'secret-value' },
    'session',
    'hello',
    undefined,
    { pinnedAddress: '127.0.0.1' }
  )
  expect(JSON.parse(reply.text).headerSecret).toBe('secret-value')
  await expect(
    resolveWebhookAddress('https://127.0.0.1/webhook/test', AbortSignal.timeout(1000))
  ).rejects.toThrow('N8N_CONFIGURATION')
  await expect(
    resolveWebhookAddress('http://169.254.169.254/latest/meta-data', AbortSignal.timeout(1000))
  ).rejects.toThrow('N8N_CONFIGURATION')
})

test('AI pages require login and API rejects unauthenticated/cross-origin requests', async ({
  request,
  baseURL,
}) => {
  for (const path of ['/ai', '/admin/ai-agents']) {
    const pageResponse = await request.get(path, { maxRedirects: 0 })
    expect([302, 303, 307, 308]).toContain(pageResponse.status())
    expect(pageResponse.headers().location).toContain('/login')
  }
  const response = await request.post('/api/ai/messages', {
    headers: { Origin: baseURL! },
    data: {},
  })
  expect(response.status()).toBe(403)
  const cancelled = await request.post('/api/ai/cancel', {
    headers: { Origin: baseURL! },
    data: {},
  })
  expect(cancelled.status()).toBe(401)
  const foreign = await request.post('/api/ai/messages', {
    headers: { Origin: 'https://foreign.invalid' },
    data: {},
  })
  expect(foreign.status()).toBe(403)
})
