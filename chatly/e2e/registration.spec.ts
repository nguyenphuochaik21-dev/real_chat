import { expect, test } from '@playwright/test'
import { registrationSchema } from '../src/lib/registration'

test('registration validates name limits and matching passwords', () => {
  const valid = {
    fullName: 'Nguyễn Văn An',
    username: 'nguyen_an',
    email: 'an@example.invalid',
    password: 'Example123',
    confirmPassword: 'Example123',
  }
  expect(registrationSchema.safeParse(valid).success).toBe(true)
  for (const change of [
    { fullName: ' ' },
    { fullName: 'a'.repeat(101) },
    { username: 'ab' },
    { username: 'a'.repeat(31) },
    { username: 'invalid name' },
    { confirmPassword: 'different' },
  ])
    expect(registrationSchema.safeParse({ ...valid, ...change }).success).toBe(false)
})

test('registration caps input and rejects mismatched passwords before signup', async ({ page }) => {
  let signupRequests = 0
  await page.route('**/auth/v1/signup**', async (route) => {
    signupRequests++
    await route.abort()
  })
  await page.goto('/register')
  const name = page.locator('#fullName')
  const username = page.locator('#username')
  await name.fill('a'.repeat(120))
  await username.fill('a'.repeat(40))
  await expect(name).toHaveValue('a'.repeat(100))
  await expect(username).toHaveValue('a'.repeat(30))
  await page.locator('#email').fill('test@example.invalid')
  await page.locator('#password').fill('Example123')
  await page.locator('#confirmPassword').fill('Different123')
  await page.locator('button[type="submit"]').click()
  await expect(page.getByText('Hai mật khẩu không trùng khớp.').first()).toBeVisible()
  expect(signupRequests).toBe(0)
})
