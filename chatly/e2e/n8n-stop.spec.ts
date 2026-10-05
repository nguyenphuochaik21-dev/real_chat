import { randomUUID } from 'node:crypto'
import { createServer, type ServerResponse } from 'node:http'
import { expect, test } from '@playwright/test'
import { provisionCallUsers } from './support/call-users'

test('n8n stop uses the registered execution and catches registration after cancellation', async ({
  page,
  playwright,
}) => {
  test.skip(
    process.env.E2E_DATABASE_CALLS !== 'true' || process.env.E2E_N8N_CONTROL !== 'true',
    'Uses temporary database records and a local n8n API stand-in'
  )
  test.setTimeout(150_000)
  const fixture = await provisionCallUsers(2)
  const agentId = randomUUID()
  const stopped: string[] = []
  const received: Array<{
    response: ServerResponse
    control: { registerUrl: string; token: string }
  }> = []
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    if (request.url === '/webhook/chat') {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      received.push({ response, control: body.chatlyControl })
      return
    }
    const stop = request.url?.match(/^\/api\/v1\/executions\/(\d+)\/stop$/)
    if (stop && request.method === 'POST' && request.headers['x-n8n-api-key'] === 'e2e-stop-key') {
      stopped.push(stop[1])
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ status: 'canceled' }))
      return
    }
    response.writeHead(403).end()
  })
  await new Promise<void>((resolve) => server.listen(5689, '127.0.0.1', resolve))
  const callbackClient = await playwright.request.newContext()
  const register = (token: string, executionId: string) =>
    callbackClient.post('http://127.0.0.1:3100/api/ai/executions', {
      headers: { Authorization: `Bearer ${token}` },
      data: { executionId },
    })
  try {
    await fixture.db.query(
      'insert into public.ai_agents(id,name,enabled,available_to_users) values($1,$2,true,true)',
      [agentId, 'n8n stop test agent']
    )
    await fixture.db.query(
      "insert into public.ai_connections(agent_id,chat_url,auth_type,protocol) values($1,$2,'none','chat')",
      [agentId, 'http://127.0.0.1:5689/webhook/chat']
    )
    const { rows } = await fixture.db.query('select public.create_ai_conversation($1,$2) as id', [
      fixture.users[0].id,
      agentId,
    ])
    const aiId = rows[0].id as string
    const mainId = randomUUID()
    await fixture.db.query('begin')
    try {
      await fixture.db.query("select set_config('request.jwt.claim.role','service_role',true)")
      await fixture.db.query(
        "insert into public.conversations(id,type,created_by,ai_agent_id,title) values($1,'ai',$2,$3,$4)",
        [mainId, fixture.users[0].id, agentId, 'n8n stop test agent']
      )
      await fixture.db.query(
        'insert into public.conversation_participants(conversation_id,user_id) values($1,$2)',
        [mainId, fixture.users[0].id]
      )
      await fixture.db.query('commit')
    } catch (error) {
      await fixture.db.query('rollback')
      throw error
    }
    await page.goto('/login')
    await page.getByLabel('Email').fill(fixture.users[0].email)
    await page.getByLabel('Mật khẩu', { exact: true }).fill(fixture.users[0].password)
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await expect(page).toHaveURL(/\/chats/, { timeout: 30_000 })

    for (const [index, channel] of ['agent', 'assistant'].entries()) {
      await page.goto(channel === 'agent' ? `/ai/${aiId}` : `/chats/${mainId}`)
      const input =
        channel === 'agent'
          ? page.getByRole('textbox', { name: 'Tin nhắn cho AI' })
          : page.locator('textarea[placeholder="Nhập tin nhắn..."]')
      await expect(async () => {
        await input.fill('Kiểm tra dừng execution')
        await expect(
          page.getByRole('button', {
            name: channel === 'agent' ? 'Gửi tin nhắn' : 'Gửi',
            exact: true,
          })
        ).toBeEnabled()
      }).toPass({ timeout: 15_000 })
      await page
        .getByRole('button', {
          name: channel === 'agent' ? 'Gửi tin nhắn' : 'Gửi',
          exact: true,
        })
        .click()
      await expect.poll(() => received.length, { timeout: 20_000 }).toBe(index + 1)
      const control = received[index].control
      expect(control.registerUrl).toBe('http://127.0.0.1:3100/api/ai/executions')
      expect((await register('forged', '8000')).status()).toBe(401)
      const executionId = String(8100 + index)
      if (channel === 'agent') {
        const registered = await register(control.token, executionId)
        expect(registered.status()).toBe(200)
        expect(await registered.json()).toMatchObject({ status: 'processing', cancelled: false })
        expect((await register(control.token, '9999')).status()).toBe(409)
      }
      await input.fill('Bản nháp cần giữ')
      const cancelledResponse = page.waitForResponse('/api/ai/cancel')
      await page.getByRole('button', { name: 'Dừng phản hồi' }).click()
      const cancelled = await (await cancelledResponse).json()
      expect(cancelled.status).toBe('cancelled')
      expect(cancelled.n8n).toBe(channel === 'agent' ? 'stopped' : 'awaiting_execution')
      if (channel === 'assistant') {
        const registered = await register(control.token, executionId)
        expect(registered.status()).toBe(200)
        expect(await registered.json()).toMatchObject({ cancelled: true, n8n: 'stopped' })
      }
      expect(stopped).toContain(executionId)
      expect(stopped).not.toContain('9999')
      await expect(input).toHaveValue('Bản nháp cần giữ')
      const table = channel === 'agent' ? 'ai_turns' : 'chat_assistant_requests'
      const conversationId = channel === 'agent' ? aiId : mainId
      const { rows: saved } = await fixture.db.query(
        `select status,n8n_execution_id,n8n_stop_status from public.${table} where conversation_id=$1`,
        [conversationId]
      )
      expect(saved[0]).toMatchObject({
        status: 'cancelled',
        n8n_execution_id: executionId,
        n8n_stop_status: 'stopped',
      })
      const repeated = await register(control.token, executionId)
      expect((await repeated.json()).n8n).toBe('stopped')
      expect(stopped.filter((id) => id === executionId)).toHaveLength(1)
      received[index].response.end(JSON.stringify({ text: 'Late output must be ignored' }))
    }
    const { rows: grants } = await fixture.db.query(
      "select has_function_privilege('authenticated','public.register_n8n_execution(uuid,uuid,uuid,uuid,text,text,text)','EXECUTE') as allowed"
    )
    expect(grants[0].allowed).toBe(false)
  } finally {
    await callbackClient.dispose()
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await fixture.db.query('delete from public.ai_conversations where user_id=any($1::uuid[])', [
      fixture.users.map((user) => user.id),
    ])
    await fixture.db.query("delete from public.conversations where type='ai' and created_by=$1", [
      fixture.users[0].id,
    ])
    await fixture.db.query('delete from public.ai_agents where id=$1', [agentId])
    await fixture.cleanup()
  }
})
