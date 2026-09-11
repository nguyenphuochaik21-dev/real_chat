import { expect, test } from '@playwright/test'
import {
  cleanupGroupUsers,
  provisionGroupUsers,
  type E2ECredentials,
  type ProvisionedGroupUsers,
} from './support/group-users'

const email = process.env.E2E_USER_EMAIL
const password = process.env.E2E_USER_PASSWORD
const mutationTestsEnabled = process.env.E2E_MUTATION_TESTS === 'true'
const hasStaticCredentials = Boolean(email && password)
const hasPartialStaticCredentials = Boolean(email || password) && !hasStaticCredentials
const autoProvisionRequested = process.env.E2E_AUTO_PROVISION === 'true'
const canRun = mutationTestsEnabled && (Boolean(email || password) || autoProvisionRequested)

test.describe('authenticated group chat', () => {
  test.skip(
    !canRun,
    'Enable E2E mutations with either a seeded account or explicitly enabled auto-provisioning.'
  )

  test('creates, opens, manages, and deletes a group', async ({ page }) => {
    if (hasPartialStaticCredentials) {
      throw new Error('Set both E2E_USER_EMAIL and E2E_USER_PASSWORD, or leave both empty.')
    }

    let provisionedUsers: ProvisionedGroupUsers | null = null
    let credentials: E2ECredentials

    if (hasStaticCredentials) {
      credentials = { email: email!, password: password! }
    } else {
      provisionedUsers = await provisionGroupUsers()
      credentials = provisionedUsers
    }

    try {
      await page.goto('/login')
      await page.getByLabel('Email').fill(credentials.email)
      await page.getByLabel('Mật khẩu', { exact: true }).fill(credentials.password)
      await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
      await expect(page).toHaveURL(/\/chats/)

      await page.getByRole('button', { name: 'Nhóm mới' }).click()
      const createDialog = page.getByRole('dialog', { name: 'Tạo nhóm mới' })
      await expect(createDialog).toBeVisible()

      const groupName = `E2E group ${Date.now()}`
      await createDialog.getByLabel('Tên nhóm').fill(groupName)
      const friends = createDialog.getByRole('checkbox')
      await expect(friends.nth(1), 'The E2E owner needs two accepted friends.').toBeVisible()
      await friends.nth(0).check()
      await friends.nth(1).check()
      await createDialog.getByRole('button', { name: 'Tạo nhóm', exact: true }).click()

      await expect(page.getByRole('heading', { name: groupName })).toBeVisible()
      await page.getByRole('button', { name: new RegExp(groupName) }).click()
      const details = page.getByRole('dialog', { name: 'Thông tin nhóm' })
      await expect(details.getByText('3 thành viên')).toBeVisible()

      const renamedGroup = `${groupName} renamed`
      await details.getByRole('button', { name: 'Đổi tên nhóm' }).click()
      await details.getByLabel('Tên nhóm').fill(renamedGroup)
      await details.getByRole('button', { name: 'Lưu', exact: true }).click()
      await expect(details.getByRole('heading', { name: renamedGroup })).toBeVisible()

      const memberActions = details.getByRole('button', { name: /^Thao tác với / })
      await memberActions.first().click()
      await details.getByRole('button', { name: 'Đặt làm quản trị viên' }).click()
      await expect(details.getByText('Quản trị viên', { exact: true })).toBeVisible()

      const joinApproval = details.getByRole('checkbox', { name: /Duyệt thành viên mới/ })
      await joinApproval.check()
      await expect(joinApproval).toBeChecked()

      page.once('dialog', (confirmation) => confirmation.accept())
      await details.getByRole('button', { name: 'Xóa vĩnh viễn nhóm' }).click()
      await expect(page).toHaveURL(/\/chats$/)
    } finally {
      if (provisionedUsers) await cleanupGroupUsers(provisionedUsers)
    }
  })
})
