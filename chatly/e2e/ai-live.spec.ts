import { expect, test, type Page } from '@playwright/test'
import { provisionCallUsers } from './support/call-users'

async function login(page: Page, user: { email: string; password: string }) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Mật khẩu', { exact: true }).fill(user.password)
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page).toHaveURL(/\/chats/)
}

test('live AI chat persists replies and isolates history between accounts', async ({
  page,
  browser,
}) => {
  test.skip(
    process.env.E2E_AI_LIVE !== 'true' || process.env.E2E_DATABASE_CALLS !== 'true',
    'Requires explicit opt-in, temporary database accounts and a live n8n agent'
  )
  test.setTimeout(150_000)
  const fixture = await provisionCallUsers(2)
  const otherContext = await browser.newContext()
  try {
    await fixture.db.query("update public.profiles set role='admin' where id=$1", [
      fixture.users[0].id,
    ])
    await login(page, fixture.users[0])
    await page.goto('/admin/ai-agents')
    await page.getByRole('button', { name: /Abbott AI/ }).click()
    await expect(page.getByText('Đã lưu xác thực.', { exact: false })).toBeVisible()
    await expect(page.getByLabel('Mật khẩu Basic Auth')).toHaveValue('')
    await page.goto('/ai')
    await page
      .locator('article')
      .filter({ hasText: 'Abbott AI' })
      .getByRole('button', { name: 'Bắt đầu trò chuyện' })
      .click()
    await expect(page).toHaveURL(/\/ai\/[\da-f-]+$/)
    const conversationUrl = page.url()
    const prompt =
      process.env.E2E_AI_PROMPT ??
      'Xin chào! Đây là kiểm thử kết nối, vui lòng trả lời ngắn một câu.'
    await page.getByLabel('Tin nhắn cho AI').fill(prompt)
    const pendingResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/ai/messages') && response.request().method() === 'POST',
      { timeout: 75_000 }
    )
    await page.getByRole('button', { name: 'Gửi tin nhắn', exact: true }).click()
    const response = await pendingResponse
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.turn?.status, body.turn?.error_message ?? body.error).toBe('completed')
    expect(body.turn.reply.length).toBeGreaterThan(0)
    await expect(page.getByText(body.turn.reply, { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByText(prompt, { exact: true })).toBeVisible()
    await expect(page.getByText(body.turn.reply, { exact: true })).toBeVisible()
    await page.screenshot({
      path: `test-results/ai-live-chat-${test.info().project.name}.png`,
      fullPage: true,
    })
    const otherPage = await otherContext.newPage()
    await login(otherPage, fixture.users[1])
    await otherPage.goto(conversationUrl)
    // App Router may send a 200 shell before resolving the not-found boundary.
    await expect(otherPage.getByRole('heading', { name: '404', exact: true })).toBeVisible()
    await expect(otherPage.getByText(prompt, { exact: true })).toHaveCount(0)
    const deniedStatus = await otherPage.evaluate(async (conversationId) => {
      const response = await fetch('/api/ai/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          conversationId,
          content: 'Unauthorized probe',
        }),
      })
      return response.status
    }, conversationUrl.split('/').at(-1))
    expect(deniedStatus).toBe(409)
    const row = await fixture.db.query('select status, reply from public.ai_turns where id=$1', [
      body.turn.id,
    ])
    expect(row.rows[0]).toEqual({ status: 'completed', reply: body.turn.reply })
  } finally {
    await otherContext.close()
    await fixture.cleanup()
  }
})
