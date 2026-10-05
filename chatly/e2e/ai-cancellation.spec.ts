import { randomUUID } from 'node:crypto'
import { createServer, type ServerResponse } from 'node:http'
import { expect, test } from '@playwright/test'
import { provisionCallUsers } from './support/call-users'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

test('AI composers retain drafts while responding and Stop persists cancellation', async ({
  page,
}) => {
  test.skip(process.env.E2E_DATABASE_CALLS !== 'true', 'Uses temporary Supabase accounts')
  test.setTimeout(150_000)
  const fixture = await provisionCallUsers(2)
  const firstReply = deferred()
  const secondReply = deferred()
  const firstHandled = deferred()
  const secondHandled = deferred()
  try {
    const { rows: agents } = await fixture.db.query(
      'select id from public.ai_agents where is_default and enabled and available_to_users'
    )
    expect(agents).toHaveLength(1)
    const { rows: created } = await fixture.db.query(
      'select public.create_ai_conversation($1,$2) as id',
      [fixture.users[0].id, agents[0].id]
    )
    const aiId = created[0].id as string

    await page.goto('/login')
    await page.getByLabel('Email').fill(fixture.users[0].email)
    await page.getByLabel('Mật khẩu', { exact: true }).fill(fixture.users[0].password)
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await expect(page).toHaveURL(/\/chats/, { timeout: 30_000 })
    await expect
      .poll(async () => (await page.request.get('/api/assistant')).status(), {
        timeout: 30_000,
      })
      .toBe(200)

    let sendCount = 0
    let firstId = ''
    await page.route('**/api/ai/messages', async (route) => {
      const input = route.request().postDataJSON() as {
        id: string
        conversationId: string
        content: string
      }
      sendCount += 1
      const first = sendCount === 1
      if (first) firstId = input.id
      await (first ? firstReply : secondReply).promise
      await route
        .fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            turn: {
              id: input.id,
              conversation_id: input.conversationId,
              user_id: fixture.users[0].id,
              content: input.content,
              reply: first ? 'Phản hồi đến muộn' : 'Phản hồi hoàn tất',
              status: 'completed',
              error_message: null,
              error_code: null,
              reply_attachments: [],
              created_at: new Date().toISOString(),
            },
          }),
        })
        .catch(() => undefined)
      ;(first ? firstHandled : secondHandled).resolve()
    })
    await page.goto(`/ai/${aiId}`)
    const aiInput = page.getByRole('textbox', { name: 'Tin nhắn cho AI' })
    await aiInput.fill('Câu hỏi cần dừng')
    await aiInput.press('Enter')
    await expect.poll(() => sendCount).toBe(1)
    await expect(aiInput).toBeEnabled()
    await expect(aiInput).toHaveValue('')
    await aiInput.fill('Bản nháp tiếp theo')
    await aiInput.press('Enter')
    expect(sendCount).toBe(1)
    await page.getByRole('button', { name: 'Dừng phản hồi', exact: true }).click()
    await expect(page.getByText('Đã dừng phản hồi.', { exact: true })).toBeVisible()
    await expect(aiInput).toHaveValue('Bản nháp tiếp theo')
    const { rows: cancelled } = await fixture.db.query(
      'select status,reply from public.ai_turns where id=$1',
      [firstId]
    )
    expect(cancelled[0]).toMatchObject({ status: 'cancelled', reply: null })
    firstReply.resolve()
    await firstHandled.promise
    await expect(page.getByText('Phản hồi đến muộn', { exact: true })).toHaveCount(0)

    await aiInput.press('Enter')
    await expect.poll(() => sendCount).toBe(2)
    await aiInput.fill('Giữ bản nháp khi AI trả lời xong')
    secondReply.resolve()
    await secondHandled.promise
    await expect(page.getByText('Phản hồi hoàn tất', { exact: true })).toBeVisible()
    await expect(aiInput).toHaveValue('Giữ bản nháp khi AI trả lời xong')

    const opened = await page.evaluate(async () => {
      const response = await fetch('/api/assistant', { method: 'POST' })
      return { status: response.status, body: await response.json() }
    })
    expect(opened.status).toBe(200)
    const mainId = opened.body.conversationId as string
    const requestId = randomUUID()
    await fixture.db.query('begin')
    try {
      await fixture.db.query("select set_config('request.jwt.claim.role','service_role',true)")
      await fixture.db.query('select public.begin_default_ai_assistant_request($1,$2,$3,$4)', [
        fixture.users[0].id,
        mainId,
        requestId,
        'Câu hỏi trong Tin nhắn',
      ])
      await fixture.db.query('commit')
    } catch (error) {
      await fixture.db.query('rollback')
      throw error
    }
    await page.goto(`/chats/${mainId}`)
    const mainInput = page.locator('textarea[placeholder="Nhập tin nhắn..."]')
    await expect(page.getByRole('button', { name: 'Dừng phản hồi' })).toBeVisible()
    await expect(mainInput).toBeEnabled()
    await mainInput.fill('Bản nháp trong Tin nhắn')
    await page.getByRole('button', { name: 'Dừng phản hồi' }).click()
    await expect(page.getByText('Đã dừng phản hồi.', { exact: true })).toBeVisible()
    await expect(mainInput).toHaveValue('Bản nháp trong Tin nhắn')

    await fixture.db.query('begin')
    try {
      await fixture.db.query("select set_config('request.jwt.claim.role','service_role',true)")
      await fixture.db.query('select public.finish_chat_assistant_request($1,$2,$3::jsonb)', [
        requestId,
        'Câu trả lời đến sau khi dừng',
        '{}',
      ])
      const failed = await fixture.db.query(
        'select public.fail_chat_assistant_request($1,$2) as status',
        [requestId, 'N8N_UNAVAILABLE']
      )
      expect(failed.rows[0].status).toBe('cancelled')
      const saved = await fixture.db.query(
        "select r.status,m.metadata->>'ai_status' as message_status,(select count(*)::int from public.messages where metadata->>'sender_type'='ai' and metadata->>'ai_request_id'=r.id::text) replies from public.chat_assistant_requests r join public.messages m on m.id=r.id where r.id=$1",
        [requestId]
      )
      expect(saved.rows[0]).toMatchObject({
        status: 'cancelled',
        message_status: 'cancelled',
        replies: 0,
      })
    } finally {
      await fixture.db.query('rollback')
    }
    await page.reload()
    await expect(page.getByText('Đã dừng phản hồi.', { exact: true })).toBeVisible()

    const { rows: foreign } = await fixture.db.query(
      'select public.create_ai_conversation($1,$2) as id',
      [fixture.users[1].id, agents[0].id]
    )
    const forbidden = await page.request.post('/api/ai/cancel', {
      headers: { Origin: new URL(page.url()).origin },
      data: { channel: 'agent', id: randomUUID(), conversationId: foreign[0].id, content: 'test' },
    })
    expect(forbidden.status()).toBe(403)
    const foreignOrigin = await page.request.post('/api/ai/cancel', {
      headers: { Origin: 'https://foreign.invalid' },
      data: { channel: 'agent', id: randomUUID(), conversationId: aiId, content: 'test' },
    })
    expect(foreignOrigin.status()).toBe(403)
  } finally {
    firstReply.resolve()
    secondReply.resolve()
    await fixture.db.query('delete from public.ai_conversations where user_id=any($1::uuid[])', [
      fixture.users.map((user) => user.id),
    ])
    await fixture.db.query("delete from public.conversations where type='ai' and created_by=$1", [
      fixture.users[0].id,
    ])
    await fixture.cleanup()
  }
})

test('Stop closes the webhook request and late output cannot complete either chat', async ({
  page,
}) => {
  test.skip(
    process.env.E2E_DATABASE_CALLS !== 'true' || Boolean(process.env.PLAYWRIGHT_PRODUCTION),
    'Uses temporary Supabase data and a development-only loopback webhook'
  )
  test.setTimeout(150_000)
  const fixture = await provisionCallUsers(2)
  const agentId = randomUUID()
  const requests: ServerResponse[] = []
  const closed = new Set<number>()
  const server = createServer((request, response) => {
    request.resume()
    const index = requests.length
    requests.push(response)
    response.on('close', () => closed.add(index))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('No webhook address')
    await fixture.db.query(
      'insert into public.ai_agents(id,name,enabled,available_to_users) values($1,$2,true,true)',
      [agentId, 'Cancellation test agent']
    )
    await fixture.db.query(
      "insert into public.ai_connections(agent_id,chat_url,auth_type,protocol) values($1,$2,'none','chat')",
      [agentId, `http://127.0.0.1:${address.port}/webhook/cancel-test`]
    )
    const { rows: conversations } = await fixture.db.query(
      'select public.create_ai_conversation($1,$2) as id',
      [fixture.users[0].id, agentId]
    )
    const aiId = conversations[0].id as string
    const mainId = randomUUID()
    await fixture.db.query('begin')
    try {
      await fixture.db.query("select set_config('request.jwt.claim.role','service_role',true)")
      await fixture.db.query(
        "insert into public.conversations(id,type,created_by,ai_agent_id,title) values($1,'ai',$2,$3,$4)",
        [mainId, fixture.users[0].id, agentId, 'Cancellation test agent']
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
    await expect
      .poll(async () => (await page.request.get('/api/assistant')).status(), {
        timeout: 30_000,
      })
      .toBe(200)

    await page.goto(`/ai/${aiId}`)
    const aiInput = page.getByRole('textbox', { name: 'Tin nhắn cho AI' })
    await aiInput.fill('Dừng webhook của agent')
    await aiInput.press('Enter')
    await expect.poll(() => requests.length, { timeout: 15_000 }).toBe(1)
    await aiInput.fill('Bản nháp agent đang nhập')
    await page.getByRole('button', { name: 'Dừng phản hồi' }).click()
    await expect(aiInput).toHaveValue('Bản nháp agent đang nhập')
    await expect.poll(() => closed.has(0), { timeout: 10_000 }).toBe(true)
    requests[0].end(JSON.stringify({ text: 'Late agent output' }))
    const { rows: agentTurns } = await fixture.db.query(
      'select status,reply from public.ai_turns where conversation_id=$1',
      [aiId]
    )
    expect(agentTurns[0]).toMatchObject({ status: 'cancelled', reply: null })

    await page.goto(`/chats/${mainId}`)
    const mainInput = page.locator('textarea[placeholder="Nhập tin nhắn..."]')
    await mainInput.fill('Dừng webhook trong Tin nhắn')
    await page.getByRole('button', { name: 'Gửi', exact: true }).click()
    await expect.poll(() => requests.length, { timeout: 15_000 }).toBe(2)
    await mainInput.fill('Bản nháp Tin nhắn đang nhập')
    await page.getByRole('button', { name: 'Dừng phản hồi' }).click()
    await expect(mainInput).toHaveValue('Bản nháp Tin nhắn đang nhập')
    await expect.poll(() => closed.has(1), { timeout: 10_000 }).toBe(true)
    requests[1].end(JSON.stringify({ text: 'Late main output' }))
    const { rows: mainRequests } = await fixture.db.query(
      'select status from public.chat_assistant_requests where conversation_id=$1',
      [mainId]
    )
    expect(mainRequests[0].status).toBe('cancelled')
    const { rows: lateReplies } = await fixture.db.query(
      "select id from public.messages where conversation_id=$1 and metadata->>'sender_type'='ai'",
      [mainId]
    )
    expect(lateReplies).toHaveLength(0)

    await mainInput.fill('Câu hỏi hoàn tất bình thường')
    await page.getByRole('button', { name: 'Gửi', exact: true }).click()
    await expect.poll(() => requests.length, { timeout: 15_000 }).toBe(3)
    await mainInput.fill('Bản nháp còn nguyên sau khi hoàn tất')
    requests[2].setHeader('Content-Type', 'application/json')
    requests[2].end(JSON.stringify({ text: 'Đã trả lời thành công', attachments: [] }))
    await expect(page.getByText('Đã trả lời thành công', { exact: true })).toBeVisible({
      timeout: 15_000,
    })
    await expect(mainInput).toHaveValue('Bản nháp còn nguyên sau khi hoàn tất')
    await expect(page.getByRole('button', { name: 'Dừng phản hồi' })).toHaveCount(0)
  } finally {
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
