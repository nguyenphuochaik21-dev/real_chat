import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { provisionCallUsers } from './support/call-users'

test('live n8n cancels both chat channels and uses only completed history', async ({ page }) => {
  test.skip(
    process.env.E2E_AI_LIVE !== 'true' || process.env.E2E_DATABASE_CALLS !== 'true',
    'Requires a configured n8n workflow, real model calls and temporary database records'
  )
  test.setTimeout(240_000)
  const fixture = await provisionCallUsers(2)
  try {
    await fixture.db.query("select set_config('request.jwt.claim.role','service_role',false)")
    const { rows: agents } = await fixture.db.query(
      `select a.id,c.protocol from ai_agents a join ai_connections c on c.agent_id=a.id
       where a.enabled and a.archived_at is null and a.available_to_users`
    )
    const modernAgent = agents.find((agent) => agent.protocol === 'chat')?.id as string
    const legacyAgent = agents.find((agent) => agent.protocol === 'legacy')?.id as string
    expect(modernAgent).toBeTruthy()
    expect(legacyAgent).toBeTruthy()
    const { rows: ai } = await fixture.db.query(
      'select public.create_ai_conversation($1,$2) as id',
      [fixture.users[0].id, modernAgent]
    )
    const aiId = ai[0].id as string
    const mainId = randomUUID()
    await fixture.db.query('begin')
    try {
      await fixture.db.query("select set_config('request.jwt.claim.role','service_role',true)")
      await fixture.db.query(
        "insert into public.conversations(id,type,created_by,ai_agent_id,title) values($1,'ai',$2,$3,'Live cancellation test')",
        [mainId, fixture.users[0].id, legacyAgent]
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
    const completed = 'Tôi tên là Mây. Hãy nhớ tên tôi trong cuộc trò chuyện này.'
    const cancelled = 'CANCELLED_HISTORY_SENTINEL must never reach model context'
    await fixture.db.query(
      `insert into ai_turns(id,conversation_id,user_id,content,reply,status) values
       ($1,$2,$3,$4,'Tôi nhớ tên bạn là Mây.','completed'),($5,$2,$3,$6,null,'cancelled')`,
      [randomUUID(), aiId, fixture.users[0].id, completed, randomUUID(), cancelled]
    )
    const completedId = randomUUID()
    await fixture.db.query('select public.begin_default_ai_assistant_request($1,$2,$3,$4)', [
      fixture.users[0].id,
      mainId,
      completedId,
      completed,
    ])
    await fixture.db.query(
      "select public.finish_chat_assistant_request($1,'Tôi nhớ tên bạn là Mây.','{}'::jsonb)",
      [completedId]
    )
    await fixture.db.query("select public.cancel_ai_generation($1,$2,$3,$4,'assistant')", [
      fixture.users[0].id,
      mainId,
      randomUUID(),
      cancelled,
    ])

    await page.goto('/login')
    await page.getByLabel('Email').fill(fixture.users[0].email)
    await page.getByLabel('Mật khẩu', { exact: true }).fill(fixture.users[0].password)
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await expect(page).toHaveURL(/\/chats/, { timeout: 30_000 })
    await expect.poll(async () => (await page.request.get('/api/assistant')).status(), {
      timeout: 30_000,
    }).toBe(200)
    for (const channel of ['agent', 'assistant'] as const) {
      const conversationId = channel === 'agent' ? aiId : mainId
      const table = channel === 'agent' ? 'ai_turns' : 'chat_assistant_requests'
      await page.goto(channel === 'agent' ? `/ai/${conversationId}` : `/chats/${conversationId}`)
      const input =
        channel === 'agent'
          ? page.getByRole('textbox', { name: 'Tin nhắn cho AI' })
          : page.locator('textarea[placeholder="Nhập tin nhắn..."]')
      const send = page.getByRole('button', {
        name: channel === 'agent' ? 'Gửi tin nhắn' : 'Gửi',
        exact: true,
      })
      await expect(async () => {
        await input.fill('Tên tôi là gì? Chỉ trả lời tên của tôi, không giải thích.')
        await expect(send).toBeEnabled()
      }).toPass({ timeout: 15_000 })
      const replyResponse = page.waitForResponse(
        (response) =>
          response
            .url()
            .endsWith(channel === 'agent' ? '/api/ai/messages' : '/api/assistant/messages'),
        { timeout: 145_000 }
      )
      await send.click()
      const response = await replyResponse
      const replyBody = await response.json()
      expect(response.status(), JSON.stringify(replyBody)).toBe(200)
      expect(channel === 'agent' ? replyBody.turn.status : replyBody.status).toBe('completed')
      const history = await fixture.db.query(
        'select public.get_completed_ai_history($1,$2,$3) as history',
        [fixture.users[0].id, conversationId, channel]
      )
      const turns = history.rows[0].history as Array<{ content: string; reply: string }>
      expect(turns.at(-1)?.reply).toMatch(/Mây/i)
      expect(JSON.stringify(turns)).not.toContain('CANCELLED_HISTORY_SENTINEL')
      await expect(
        fixture.db.query('select public.get_completed_ai_history($1,$2,$3)', [
          fixture.users[1].id,
          conversationId,
          channel,
        ])
      ).rejects.toThrow('FORBIDDEN')

      const slowPrompt =
        'LIVE_CANCELLED_SENTINEL: Hãy viết một truyện dài 5000 từ về chuyến thám hiểm đại dương, có nhiều chương và hội thoại chi tiết.'
      await input.fill(slowPrompt)
      await send.click()
      let executionId = ''
      await expect
        .poll(
          async () => {
            const { rows } = await fixture.db.query(
              `select n8n_execution_id from public.${table} where conversation_id=$1 and content=$2`,
              [conversationId, slowPrompt]
            )
            executionId = rows[0]?.n8n_execution_id ?? ''
            return Boolean(executionId)
          },
          { timeout: 20_000 }
        )
        .toBe(true)
      await input.fill('Bản nháp sau khi dừng n8n')
      const stopping = page.waitForResponse('/api/ai/cancel', { timeout: 20_000 })
      await page.getByRole('button', { name: 'Dừng phản hồi' }).click()
      const stopped = await (await stopping).json()
      expect(stopped).toMatchObject({ status: 'cancelled', n8n: 'stopped' })
      await expect(input).toHaveValue('Bản nháp sau khi dừng n8n')
      const n8n = await fetch(`${process.env.N8N_API_URL}/executions/${executionId}`, {
        headers: { 'X-N8N-API-KEY': process.env.N8N_API_KEY! },
      })
      if (n8n.status !== 404) {
        expect(n8n.status).toBe(200)
        expect((await n8n.json()).status).toBe('canceled')
      }
      const { rows: after } = await fixture.db.query(
        'select public.get_completed_ai_history($1,$2,$3) as history',
        [fixture.users[0].id, conversationId, channel]
      )
      expect(JSON.stringify(after[0].history)).not.toContain('LIVE_CANCELLED_SENTINEL')
      console.log(
        JSON.stringify({ channel, executionId, n8n: 'canceled', completedMemoryVerified: true })
      )
    }
  } finally {
    await fixture.db.query('delete from public.ai_conversations where user_id=any($1::uuid[])', [
      fixture.users.map((user) => user.id),
    ])
    await fixture.db.query("delete from public.conversations where type='ai' and created_by=$1", [
      fixture.users[0].id,
    ])
    await fixture.cleanup()
  }
})
