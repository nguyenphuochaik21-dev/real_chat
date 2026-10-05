import { expect, test, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { provisionCallUsers } from './support/call-users'

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Mật khẩu', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page).toHaveURL(/\/chats/, { timeout: 30_000 })
  await expect
    .poll(async () => (await page.request.get('/api/assistant')).status(), { timeout: 30_000 })
    .toBe(200)
}

test('canonical AI pages preserve selected and default agents independently', async ({ page }) => {
  test.skip(
    process.env.E2E_DATABASE_CALLS !== 'true',
    'Requires explicit opt-in for temporary Supabase test accounts'
  )
  test.setTimeout(120_000)
  page.setDefaultTimeout(15_000)
  const fixture = await provisionCallUsers(2)
  const selectedAgentId = randomUUID()
  const selectedAgentName = `E2E agent ${selectedAgentId.slice(0, 8)}`
  try {
    await fixture.db.query(
      'insert into public.ai_agents(id,name,enabled,available_to_users) values($1,$2,true,true)',
      [selectedAgentId, selectedAgentName]
    )
    await fixture.db.query(
      "insert into public.ai_connections(agent_id,chat_url,auth_type) values($1,'https://example.invalid/webhook/e2e','none')",
      [selectedAgentId]
    )
    const { rows: defaults } = await fixture.db.query(
      'select id from public.ai_agents where is_default'
    )
    const defaultId = defaults[0]?.id as string | undefined
    expect(defaultId).toBeTruthy()
    expect(defaults).toHaveLength(1)
    await fixture.db.query("update public.profiles set role='admin' where id=$1", [
      fixture.users[0].id,
    ])
    await login(page, fixture.users[0])

    await page.goto('/admin/ai')
    await expect(page).toHaveURL(/\/admin\/ai-agents/, { timeout: 30_000 })
    await expect(async () => {
      await page
        .getByRole('region', { name: 'Danh sách agent' })
        .getByRole('button', { name: new RegExp(selectedAgentName) })
        .click()
      await expect(page.getByRole('heading', { name: 'Sửa agent' })).toBeVisible({
        timeout: 3000,
      })
    }).toPass({ timeout: 15_000 })
    await page.getByText('Hướng dẫn kết nối n8n').click()
    await expect(page.getByText('Webhook → Normalize Input', { exact: false })).toBeVisible()
    await page
      .getByRole('combobox', { name: 'Kiểu xác thực', exact: true })
      .selectOption('header_secret')
    await expect(page.getByLabel('Secret', { exact: true })).toHaveValue('')

    await page.goto('/settings')
    await expect(page.getByRole('link', { name: /Quản lý AI Agents/ })).toHaveCount(1)
    await expect(page.getByRole('link', { name: /Default AI Assistant/ })).toHaveCount(0)

    await page.goto('/ai')
    await expect(page.locator('article').filter({ hasText: selectedAgentName })).toHaveCount(1)
    await page
      .locator('article')
      .filter({ hasText: selectedAgentName })
      .getByRole('button', { name: 'Bắt đầu trò chuyện' })
      .click()
    await expect(page).toHaveURL(/\/ai\/[\da-f-]+$/)
    const { rows: aiConversation } = await fixture.db.query(
      'select agent_id from public.ai_conversations where id=$1',
      [page.url().split('/').at(-1)]
    )
    expect(aiConversation[0]?.agent_id).toBe(selectedAgentId)

    let agentSendCount = 0
    await page.route('**/api/ai/messages', async (route) => {
      agentSendCount += 1
      const input = route.request().postDataJSON()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          turn: {
            id: input.id,
            conversation_id: input.conversationId,
            user_id: fixture.users[0].id,
            content: input.content,
            reply: 'Xin chào',
            status: 'completed',
            error_message: null,
            error_code: null,
            reply_attachments: [],
            created_at: new Date().toISOString(),
          },
        }),
      })
    })
    const aiInput = page.getByRole('textbox', { name: 'Tin nhắn cho AI' })
    await aiInput.fill('xin chào')
    await aiInput.press('Shift+Enter')
    await expect(aiInput).toHaveValue('xin chào\n')
    expect(agentSendCount).toBe(0)
    await aiInput.fill('xin chào')
    await aiInput.press('Enter')
    await expect(page.getByText('Xin chào', { exact: true })).toBeVisible()
    expect(agentSendCount).toBe(1)
    const aiBubble = await page.getByText('xin chào', { exact: true }).locator('..').boundingBox()
    expect(aiBubble?.width).toBeLessThan(200)

    const opened = await page.evaluate(async () => {
      const response = await fetch('/api/assistant', { method: 'POST' })
      return { status: response.status, body: await response.json() }
    })
    expect(opened.status).toBe(200)
    const { rows: mainConversation } = await fixture.db.query(
      'select ai_agent_id from public.conversations where id=$1',
      [opened.body.conversationId]
    )
    expect(mainConversation[0]?.ai_agent_id).toBe(defaultId)

    await fixture.db.query('begin')
    try {
      await fixture.db.query("select set_config('request.jwt.claim.role','service_role',true)")
      const requestId = randomUUID()
      const claim = await fixture.db.query(
        'select public.begin_default_ai_assistant_request($1,$2,$3,$4) as claimed',
        [fixture.users[0].id, opened.body.conversationId, requestId, 'xin chào']
      )
      expect(claim.rows[0]?.claimed).toBe(true)
      await fixture.db.query('update public.messages set metadata=$2::jsonb where id=$1', [
        requestId,
        JSON.stringify({ ai_request_id: requestId, ai_status: 'processing' }),
      ])
      await fixture.db.query('select public.finish_chat_assistant_request($1,$2,$3::jsonb)', [
        requestId,
        'Xin chào từ AI',
        JSON.stringify({ format: 'text', sources: [], attachments: [] }),
      ])
      const saved = await fixture.db.query(
        "select r.status,count(m.id)::int as replies from public.chat_assistant_requests r left join public.messages m on m.metadata->>'ai_request_id'=r.id::text and m.metadata->>'sender_type'='ai' where r.id=$1 group by r.status",
        [requestId]
      )
      expect(saved.rows[0]).toMatchObject({ status: 'completed', replies: 1 })
    } finally {
      await fixture.db.query('rollback')
    }

    await page.route('**/api/assistant/messages', async (route) => {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'N8N_UNAVAILABLE', saved: true }),
      })
    })
    await page.goto(`/chats/${opened.body.conversationId}`)
    const mainInput = page.locator('textarea[placeholder="Nhập tin nhắn..."]')
    await mainInput.fill('xin chào')
    await page.getByRole('button', { name: 'Gửi', exact: true }).click()
    await expect(
      page.getByText('n8n hiện không phản hồi. Tin nhắn chưa được AI trả lời.', { exact: true })
    ).toBeVisible()
    const mainBubble = await page.getByText('xin chào', { exact: true }).locator('..').boundingBox()
    expect(mainBubble?.width).toBeLessThan(200)
  } finally {
    await fixture.db.query('delete from public.ai_conversations where user_id=$1', [
      fixture.users[0].id,
    ])
    await fixture.db.query("delete from public.conversations where type='ai' and created_by=$1", [
      fixture.users[0].id,
    ])
    await fixture.db.query('delete from public.ai_agents where id=$1', [selectedAgentId])
    await fixture.cleanup()
  }
})
