import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { provisionCallUsers } from './support/call-users'
import AxeBuilder from '@axe-core/playwright'

test.use({ trace: 'off' })

test('search loads all pages, fits date filters and blocks suspended AI navigation', async ({
  page,
}, testInfo) => {
  test.skip(process.env.E2E_DATABASE_CALLS !== 'true', 'Requires temporary database accounts')
  test.setTimeout(120_000)
  page.setDefaultTimeout(15_000)
  const fixture = await provisionCallUsers()
  const [owner, peer] = fixture.users
  try {
    await fixture.db.query(
      "insert into public.messages(conversation_id,sender_id,content) select $1,$2,'paginationprobe ' || n from generate_series(1,45) n",
      [fixture.conversationId, peer.id]
    )
    await page.goto('/login')
    await page.getByLabel('Email').fill(owner.email)
    await page.locator('#password').fill(owner.password)
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await expect(page).toHaveURL(/\/chats/, { timeout: 30_000 })
    await page.goto(`/chats/${fixture.conversationId}`)
    await page.getByRole('heading', { name: 'Call Receiver', exact: true }).click()
    await page
      .locator('section[aria-label]')
      .getByRole('button', { name: 'Tìm kiếm', exact: true })
      .click()
    const dialog = page.getByRole('dialog', { name: 'Tin nhắn', exact: true })
    await dialog.getByRole('textbox').fill('paginationprobe')
    await expect(dialog.getByText('Tìm thấy 20+ kết quả')).toBeVisible({ timeout: 15_000 })
    await dialog.getByRole('button', { name: 'Tải thêm kết quả' }).click()
    await expect(dialog.getByText('Tìm thấy 40+ kết quả')).toBeVisible()
    await dialog.getByRole('button', { name: 'Tải thêm kết quả' }).click()
    await expect(dialog.getByText('Tìm thấy 45 kết quả')).toBeVisible()
    await expect(dialog.getByRole('button', { name: /paginationprobe/ })).toHaveCount(45)
    await expect(dialog.getByRole('button', { name: 'Tải thêm kết quả' })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Ngày', exact: true }).click()
    const today = await page.evaluate(() => {
      const now = new Date()
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    })
    await dialog.getByLabel('Từ', { exact: true }).fill(today)
    await dialog.getByLabel('Đến', { exact: true }).fill(today)
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true
    )
    await page.screenshot({ path: testInfo.outputPath('search-filters.png'), fullPage: true })
    await dialog.getByRole('button', { name: 'Áp dụng', exact: true }).click()
    await expect(dialog.getByText('Tìm thấy 20+ kết quả')).toBeVisible()
    const accessibility = await new AxeBuilder({ page }).include('[role="dialog"]').analyze()
    expect(
      accessibility.violations.filter((item) => ['serious', 'critical'].includes(item.impact ?? ''))
    ).toEqual([])
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await fixture.db.query('update public.profiles set is_suspended=true where id=$1', [owner.id])
    for (const path of ['/ai', '/ai/11111111-1111-4111-8111-111111111111', '/join/test-token']) {
      const response = await page.request.get(path, { maxRedirects: 0 })
      expect(response.status()).toBe(307)
      expect(response.headers().location).toContain('/suspended')
    }
  } finally {
    try {
      await page.context().close()
    } finally {
      await fixture.cleanup()
    }
  }
})

test('mobile layout, empty media, group options and independent sign-out', async ({ page }) => {
  test.skip(process.env.E2E_DATABASE_CALLS !== 'true', 'Requires temporary database accounts')
  test.setTimeout(120_000)
  const fixture = await provisionCallUsers()
  const [owner, peer] = fixture.users
  const otherDevice = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  try {
    await fixture.db.query(
      'update public.profiles set display_name=$1,bio=$2,is_verified=true where id=$3',
      ['Nguyễn Xuân Hiếu', 'Tài khoản có phần giới thiệu dài để kiểm tra tràn khung', peer.id]
    )
    const login = await otherDevice.auth.signInWithPassword(owner)
    expect(login.error).toBeNull()
    await page.goto('/login')
    await page.locator('#email').fill(owner.email)
    await page.locator('#password').fill(owner.password)
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await expect(page).toHaveURL(/\/chats/, { timeout: 20_000 })
    await page.goto('/contacts')
    const identity = page.locator(`a[href="/profile/${peer.id}"]`)
    await expect(identity).toBeVisible()
    expect(
      await identity.evaluate((el) => {
        const row = el.parentElement!
        return row.scrollWidth <= row.clientWidth && row.getBoundingClientRect().right <= innerWidth
      })
    ).toBe(true)
    await page.goto(`/chats/${fixture.conversationId}`)
    await page.getByRole('heading', { name: 'Nguyễn Hiếu', exact: true }).click()
    await page.getByRole('button', { name: 'File phương tiện', exact: true }).click()
    const gallery = page.getByRole('dialog', { name: 'Ảnh, video và tệp' })
    await expect(gallery).toBeVisible()
    await expect(gallery.getByText('Chưa có tệp nào được chia sẻ')).toBeVisible()
    await gallery.getByRole('button', { name: 'Đóng' }).click()
    await expect(page.locator('textarea')).toBeVisible()

    await fixture.db.query('insert into public.user_blocks(blocker_id,blocked_id) values ($1,$2)', [
      peer.id,
      owner.id,
    ])
    const blockedText = 'This message must not be delivered'
    await page.locator('textarea').fill(blockedText)
    await page.getByRole('button', { name: 'Gửi', exact: true }).click()
    await expect(
      page.getByText('Xin lỗi, hiện không thể gửi tin nhắn trong cuộc trò chuyện này.')
    ).toBeVisible()
    await expect(page.locator('textarea')).toHaveValue(blockedText)
    expect(
      (
        await fixture.db.query(
          'select id from public.messages where conversation_id=$1 and content=$2',
          [fixture.conversationId, blockedText]
        )
      ).rowCount
    ).toBe(0)
    await fixture.db.query('delete from public.user_blocks where blocker_id=$1 and blocked_id=$2', [
      peer.id,
      owner.id,
    ])
    await page.getByRole('button', { name: 'Gửi', exact: true }).click()
    await expect(page.getByRole('log').getByText(blockedText, { exact: true })).toBeVisible()
    await expect
      .poll(
        async () =>
          (
            await fixture.db.query(
              'select id from public.messages where conversation_id=$1 and content=$2',
              [fixture.conversationId, blockedText]
            )
          ).rowCount
      )
      .toBe(1)

    await fixture.db.query(
      "update public.conversations set type='group',title='UX group' where id=$1",
      [fixture.conversationId]
    )
    await page.reload()
    await page.getByRole('heading', { name: 'UX group', exact: true }).click()
    const group = page.getByRole('dialog', { name: 'Thông tin nhóm' })
    await expect(group.getByRole('button', { name: 'Tìm kiếm', exact: true })).toBeVisible()
    await group.getByRole('button', { name: 'File phương tiện', exact: true }).click()
    await expect(gallery.getByText('Chưa có tệp nào được chia sẻ')).toBeVisible()
    await gallery.getByRole('button', { name: 'Đóng' }).click()
    await page.getByRole('heading', { name: 'UX group', exact: true }).click()
    await group.getByRole('button', { name: 'Tùy chỉnh', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Ghim', exact: true })).toBeVisible()
    await page.goto('/settings')
    const logout = page.waitForRequest((request) => request.url().includes('/auth/v1/logout'))
    await page.getByText('Đăng xuất', { exact: true }).click()
    expect(new URL((await logout).url()).searchParams.get('scope')).toBe('local')
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 })
    const refreshed = await otherDevice.auth.refreshSession()
    expect(refreshed.error).toBeNull()
    expect(refreshed.data.session?.user.id).toBe(owner.id)
  } finally {
    await otherDevice.auth.signOut({ scope: 'local' })
    try {
      await page.context().close()
    } finally {
      await fixture.cleanup()
    }
  }
})

test('authenticated pages fit the viewport and have accessible controls', async ({
  page,
}, testInfo) => {
  test.skip(process.env.E2E_DATABASE_CALLS !== 'true', 'Requires temporary database accounts')
  test.setTimeout(180_000)
  const fixture = await provisionCallUsers()
  const owner = fixture.users[0]
  try {
    await fixture.db.query("update public.profiles set role='admin' where id=$1", [owner.id])
    await page.goto('/login')
    await page.getByLabel('Email').fill(owner.email)
    await page.locator('#password').fill(owner.password)
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await expect(page).toHaveURL(/\/chats/, { timeout: 30_000 })
    for (const path of [
      '/chats',
      '/contacts',
      '/calls',
      '/settings',
      '/settings/profile',
      '/settings/appearance',
      '/settings/support',
      '/ai',
      '/admin',
      '/admin/ai-agents',
    ]) {
      await page.goto(path)
      await expect(page.locator('h1,h2').first()).toBeVisible({ timeout: 15_000 })
      await expect(page.locator('.animate-spin')).toHaveCount(0, { timeout: 15_000 })
      await expect(page.getByText('Tạm thời không thể mở trang', { exact: true })).toHaveCount(0)
      expect
        .soft(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${path} horizontal overflow`
        )
        .toBe(true)
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      const violations = result.violations
        .filter((item) => ['serious', 'critical'].includes(item.impact ?? ''))
        .map((item) => ({ id: item.id, nodes: item.nodes.map((node) => node.target) }))
      expect.soft(violations, path).toEqual([])
      await page.screenshot({
        path: testInfo.outputPath(`${path.slice(1).replaceAll('/', '-')}.png`),
        fullPage: true,
      })
    }
  } finally {
    try {
      await page.context().close()
    } finally {
      await fixture.cleanup()
    }
  }
})
