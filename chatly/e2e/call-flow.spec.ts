import { expect, test, type Page, type BrowserContext } from '@playwright/test'
import { provisionCallUsers } from './support/call-users'

test.use({
  trace: 'off',
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
})

test.describe('two-account WebRTC calls', () => {
  test.skip(
    process.env.E2E_DATABASE_CALLS !== 'true',
    'Opt in to temporary database-backed accounts'
  )
  test('contacts, voice, video, decline and 45-second missed call', async ({
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Two desktop Chromium contexts with fake media')
    test.setTimeout(180_000)
    const fixture = await provisionCallUsers()
    const contexts: BrowserContext[] = []
    try {
      for (let index = 0; index < fixture.users.length; index++) {
        contexts.push(
          await browser.newContext({
            permissions: ['microphone', 'camera'],
            baseURL: testInfo.project.use.baseURL,
          })
        )
      }
      const [caller, receiver] = await Promise.all(contexts.map((context) => context.newPage()))
      const failures: string[] = []
      for (const page of [caller, receiver]) {
        page.on('pageerror', (error) => failures.push(error.message))
        page.on('response', (response) => {
          if (
            response.status() >= 500 &&
            response.url().startsWith(String(testInfo.project.use.baseURL))
          )
            failures.push(`${response.status()} ${new URL(response.url()).pathname}`)
        })
      }
      await Promise.all(
        [caller, receiver].map(async (page, index) => {
          await page.goto('/login')
          await page.getByLabel('Email').fill(fixture.users[index].email)
          await page.getByLabel('Mật khẩu', { exact: true }).fill(fixture.users[index].password)
          await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
          await expect(page).toHaveURL(/\/chats/, { timeout: 20_000 })
        })
      )
      await caller.goto('/contacts')
      await expect(caller.getByText(fixture.users[1].name, { exact: true })).toBeVisible()
      await expect(caller.locator('header [role="alert"]')).toHaveCount(0)
      await Promise.all(
        [caller, receiver].map((page) => page.goto(`/chats/${fixture.conversationId}`))
      )

      const waitMedia = async (page: Page, kind: 'audio' | 'video') => {
        await expect
          .poll(
            () =>
              page.locator(kind).evaluateAll(
                (elements, trackKind) =>
                  elements.some((element) => {
                    const stream = (element as HTMLMediaElement).srcObject
                    return (
                      !(element as HTMLMediaElement).muted &&
                      stream instanceof MediaStream &&
                      stream
                        .getTracks()
                        .some((track) => track.kind === trackKind && track.readyState === 'live')
                    )
                  }),
                kind
              ),
            { timeout: 25_000 }
          )
          .toBe(true)
        await expect(page.getByText(/^00:0[1-9]$/, { exact: true })).toBeVisible({
          timeout: 15_000,
        })
      }
      for (const kind of ['voice', 'video'] as const) {
        await caller
          .getByRole('button', { name: kind === 'voice' ? 'Gọi thoại' : 'Gọi video', exact: true })
          .click()
        const dialog = receiver.getByRole('dialog', {
          name: kind === 'voice' ? 'Cuộc gọi thoại đến' : 'Cuộc gọi video đến',
        })
        await expect(dialog).toBeVisible({ timeout: 20_000 })
        await dialog.getByRole('button', { name: 'Chấp nhận' }).click()
        await Promise.all(
          [caller, receiver].map((page) => waitMedia(page, kind === 'voice' ? 'audio' : 'video'))
        )
        await caller.getByRole('button', { name: 'Kết thúc', exact: true }).click()
        await expect(receiver.getByText(/giây · Cuộc gọi đến/).last()).toBeVisible({
          timeout: 15_000,
        })
        await expect(caller.getByRole('button', { name: 'Gọi thoại', exact: true })).toBeVisible()
        await expect(caller.getByText('Cuộc gọi đã kết thúc', { exact: true })).toHaveCount(0, {
          timeout: 5000,
        })
      }

      await caller.getByRole('button', { name: 'Gọi thoại', exact: true }).click()
      await receiver
        .getByRole('dialog', { name: 'Cuộc gọi thoại đến' })
        .getByRole('button', { name: 'Từ chối' })
        .click({ timeout: 20_000 })
      await expect(receiver.getByText('Cuộc gọi bị từ chối', { exact: true }).first()).toBeVisible()
      await expect(caller.getByText('Cuộc gọi đã kết thúc', { exact: true })).toHaveCount(0, {
        timeout: 5000,
      })
      // Wait for the terminal overlay on the recipient to clear before another call.
      await expect(receiver.getByRole('button', { name: 'Gọi thoại', exact: true })).toBeVisible()
      const started = Date.now()
      await caller.getByRole('button', { name: 'Gọi thoại', exact: true }).click()
      await expect(receiver.getByRole('dialog', { name: 'Cuộc gọi thoại đến' })).toBeVisible({
        timeout: 20_000,
      })
      await expect(receiver.getByRole('dialog', { name: 'Cuộc gọi thoại đến' })).toHaveCount(0, {
        timeout: 55_000,
      })
      await expect(receiver.getByText('Cuộc gọi nhỡ', { exact: true }).last()).toBeVisible()
      expect(Date.now() - started).toBeGreaterThanOrEqual(40_000)
      expect(Date.now() - started).toBeLessThan(55_000)
      const { rows: history } = await fixture.db.query(
        'select status,duration_seconds from public.call_history where conversation_id=$1 order by started_at',
        [fixture.conversationId]
      )
      expect(history.map((row) => row.status)).toEqual(['ended', 'ended', 'declined', 'missed'])
      expect(history[0].duration_seconds).toBeGreaterThan(0)
      expect(history[1].duration_seconds).toBeGreaterThan(0)
      expect(history[3].duration_seconds).toBe(0)
      expect(failures).toEqual([])
    } catch (error) {
      console.error('[call flow]', error instanceof Error ? error.message : 'failed')
      throw error
    } finally {
      await Promise.all(contexts.map((context) => context.close()))
      await fixture.cleanup()
    }
  })
})
