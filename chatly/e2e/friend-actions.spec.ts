import { expect, test } from '@playwright/test'
import { provisionCallUsers } from './support/call-users'

test('friend search, fast actions, and realtime notifications', async ({ page, browser }) => {
  test.skip(process.env.E2E_DATABASE_CALLS !== 'true', 'Requires temporary database accounts')
  test.setTimeout(120_000)
  const fixture = await provisionCallUsers()
  const [sender, receiver] = fixture.users
  const receiverContext = await browser.newContext()
  try {
    await fixture.db.query(
      'delete from public.friendships where requester_id=$1 and addressee_id=$2',
      [sender.id, receiver.id]
    )

    const receiverPage = await receiverContext.newPage()
    await receiverPage.goto('/login')
    await receiverPage.locator('#email').fill(receiver.email)
    await receiverPage.locator('#password').fill(receiver.password)
    await receiverPage.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await expect(receiverPage).toHaveURL(/\/chats/, { timeout: 20_000 })
    await receiverPage.goto('/contacts')

    await page.goto('/login')
    await page.locator('#email').fill(sender.email)
    await page.locator('#password').fill(sender.password)
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await expect(page).toHaveURL(/\/chats/, { timeout: 20_000 })
    await page.goto('/contacts')

    await page.getByPlaceholder('Tìm theo tên hoặc tên người dùng').fill(receiver.name)
    const receiverRow = page.locator(`a[href="/profile/${receiver.id}"]`).locator('..')
    await expect(receiverRow.getByRole('button', { name: 'Kết bạn' })).toBeVisible()
    await receiverRow.getByRole('button', { name: 'Kết bạn' }).click()
    await expect(receiverRow.getByRole('button', { name: 'Hủy lời mời' })).toBeVisible()
    await expect(page.getByText('Đã gửi lời mời kết bạn')).toBeVisible()
    await receiverRow.getByRole('button', { name: 'Hủy lời mời' }).click()
    await expect(page.getByText('Đã hủy lời mời kết bạn')).toBeVisible()
    await expect(receiverRow.getByRole('button', { name: 'Kết bạn' })).toBeVisible()
    await receiverRow.getByRole('button', { name: 'Kết bạn' }).click()

    const senderRow = receiverPage.locator(`a[href="/profile/${sender.id}"]`).locator('..')
    await expect(senderRow.getByRole('button', { name: 'Chấp nhận' })).toBeVisible({
      timeout: 20_000,
    })
    await expect(
      receiverPage.getByText(`${sender.name} đã gửi lời mời kết bạn`).first()
    ).toBeVisible({ timeout: 20_000 })
    await senderRow.getByRole('button', { name: 'Chấp nhận' }).click()
    await expect(receiverPage.getByText('Đã chấp nhận lời mời kết bạn')).toBeVisible()
    await expect(page.getByText(`${receiver.name} đã chấp nhận lời mời kết bạn`)).toBeVisible({
      timeout: 20_000,
    })
    page.once('dialog', (dialog) => void dialog.accept())
    await receiverRow.getByRole('button', { name: 'Hủy kết bạn' }).click()
    await expect(page.getByText('Đã hủy kết bạn')).toBeVisible()
  } finally {
    await receiverContext.close()
    await fixture.cleanup()
  }
})
