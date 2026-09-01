import { expect, test } from '@playwright/test'

const email = process.env.E2E_USER_EMAIL
const password = process.env.E2E_USER_PASSWORD
const mutationTestsEnabled = process.env.E2E_MUTATION_TESTS === 'true'

test.describe('authenticated group chat', () => {
  test.skip(
    !email || !password || !mutationTestsEnabled,
    'Set E2E_USER_EMAIL, E2E_USER_PASSWORD, and E2E_MUTATION_TESTS=true for group mutations.'
  )

  test('creates, opens, manages, and deletes a group', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(email!)
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password!)
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await expect(page).toHaveURL(/\/chats/)

    await page.getByRole('button', { name: 'Nhóm mới' }).click()
    const dialog = page.getByRole('dialog', { name: 'Tạo nhóm mới' })
    await expect(dialog).toBeVisible()

    const groupName = `E2E group ${Date.now()}`
    await dialog.getByLabel('Tên nhóm').fill(groupName)
    const friends = dialog.getByRole('checkbox')
    test.skip((await friends.count()) < 2, 'The test account needs at least two accepted friends.')
    await friends.nth(0).click()
    await friends.nth(1).click()
    await dialog.getByRole('button', { name: 'Tạo nhóm', exact: true }).click()

    await expect(page.getByRole('heading', { name: groupName })).toBeVisible()
    await page.getByRole('button', { name: new RegExp(groupName) }).click()
    const details = page.getByRole('dialog', { name: 'Thông tin nhóm' })
    await expect(details.getByText('3 thành viên')).toBeVisible()

    page.once('dialog', (confirmation) => confirmation.accept())
    await details.getByRole('button', { name: 'Xóa vĩnh viễn nhóm' }).click()
    await expect(page).toHaveURL(/\/chats$/)
  })
})
