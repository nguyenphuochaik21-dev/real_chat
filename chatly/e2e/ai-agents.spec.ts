import { createServer, type Server } from 'node:http'
import { expect, test } from '@playwright/test'
import { postN8n } from '../src/lib/ai/protocol'

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
    } else if (request.url === '/oversize') {
      response.end(JSON.stringify({ output: 'x'.repeat(140000) }))
    } else if (request.url === '/malformed') {
      response.end(JSON.stringify({ unrelated: 'not a reply' }))
    } else if (request.url === '/text') {
      response.end(JSON.stringify([{ text: 'Xin chào' }]))
    } else {
      response.end(
        JSON.stringify({ output: JSON.stringify({ body, auth: request.headers.authorization }) })
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
  expect(JSON.parse(reply)).toEqual({
    auth: 'Basic test',
    body: { action: 'sendMessage', sessionId: 'isolated-session', chatInput: 'Câu hỏi' },
  })
  expect(await postN8n(`${base}/text`, {}, 'session', 'hello')).toBe('Xin chào')
})

test('n8n rejects redirects, oversized and malformed replies without leaking upstream body', async () => {
  await expect(postN8n(`${base}/redirect`, {}, 's', 'hello')).rejects.toThrow()
  await expect(postN8n(`${base}/oversize`, {}, 's', 'hello')).rejects.toThrow('kích thước')
  await expect(postN8n(`${base}/malformed`, {}, 's', 'hello')).rejects.toThrow('output hoặc text')
  await expect(postN8n(`${base}/unauthorized`, {}, 's', 'hello')).rejects.toThrow('HTTP 401')
  await expect(postN8n(`${base}/ok`, {}, 's', 'hello', AbortSignal.abort())).rejects.toThrow()
})

test('AI pages require login and API rejects unauthenticated/cross-origin requests', async ({
  page,
  request,
  baseURL,
}) => {
  await page.goto('/ai')
  await expect(page).toHaveURL(/\/login/)
  await page.goto('/admin/ai-agents')
  await expect(page).toHaveURL(/\/login/)
  const response = await request.post('/api/ai/messages', {
    headers: { Origin: baseURL! },
    data: {},
  })
  expect(response.status()).toBe(403)
  const foreign = await request.post('/api/ai/messages', {
    headers: { Origin: 'https://foreign.invalid' },
    data: {},
  })
  expect(foreign.status()).toBe(403)
})
