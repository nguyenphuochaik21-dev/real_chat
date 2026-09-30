import { expect, test } from '@playwright/test'
import { provisionCallUsers } from './support/call-users'

test('admin accounts paginate without duplicates and search treats symbols literally', async ({
  page,
}) => {
  test.skip(process.env.E2E_DATABASE_CALLS !== 'true', 'Requires temporary database fixtures')
  test.setTimeout(120_000)
  const fixture = await provisionCallUsers(25)
  const owner = fixture.users[0]
  try {
    await fixture.db.query("update public.profiles set role='admin' where id=$1", [owner.id])
    await page.goto('/login')
    await page.getByLabel('Email').fill(owner.email)
    await page.getByLabel('Mật khẩu', { exact: true }).fill(owner.password)
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await expect(page).toHaveURL(/\/chats/)
    await page.goto('/admin')
    const search = page.getByRole('searchbox', { name: 'Tìm tên, username hoặc email' })
    // All 25 fixture emails share the run UUID; no real accounts enter this result set.
    const runId = owner.email.slice('call-test-caller-'.length).split('@')[0]
    await search.fill(runId)
    await expect(page.getByText('Đang hiển thị 1–20/25', { exact: true })).toBeVisible()
    const rows = page.locator('section a[href^="/profile/"]')
    await expect(rows).toHaveCount(20)
    const firstPage = await rows.evaluateAll((links) =>
      links.map((link) => link.getAttribute('href'))
    )
    await page.getByRole('button', { name: 'Tiếp theo', exact: true }).click()
    await expect(rows).toHaveCount(5)
    const secondPage = await rows.evaluateAll((links) =>
      links.map((link) => link.getAttribute('href'))
    )
    expect(new Set([...firstPage, ...secondPage]).size).toBe(25)
    await expect(page.getByRole('button', { name: 'Tiếp theo', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Trước', exact: true }).click()
    await expect(rows).toHaveCount(20)
    await search.fill(`${runId}%`)
    await expect(rows).toHaveCount(0)
    await search.fill(runId)
    await expect(rows).toHaveCount(20)
    const removedFromSearch = secondPage.map((href) => href!.split('/').at(-1))
    await fixture.db.query(
      "update auth.users set email='page-removed-' || id || '@example.invalid' where id=any($1::uuid[])",
      [removedFromSearch]
    )
    await page.getByRole('button', { name: 'Tiếp theo', exact: true }).click()
    await expect(page.getByText('Đang hiển thị 1–20/20', { exact: true })).toBeVisible()
    await expect(rows).toHaveCount(20)
    await expect(page.getByRole('button', { name: 'Tiếp theo', exact: true })).toBeDisabled()
  } finally {
    await fixture.cleanup()
  }
})
