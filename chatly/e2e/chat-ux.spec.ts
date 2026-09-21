import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { provisionCallUsers } from './support/call-users'

test.use({ trace: 'off' })

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
    await page.context().close()
    await fixture.cleanup()
  }
})
