import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test.describe('public application shell', () => {
  test('login is responsive and has no serious accessibility violations', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByRole('main')).toBeVisible()

    await expect(page.getByRole('heading', { name: 'Đăng nhập Chatly' })).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Mật khẩu', { exact: true })).toBeVisible()

    const passwordToggle = page.locator('#password').locator('..').getByRole('button')
    const toggleBox = await passwordToggle.boundingBox()
    expect(toggleBox?.width).toBeGreaterThanOrEqual(40)
    expect(toggleBox?.height).toBeGreaterThanOrEqual(40)

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const seriousViolations = results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact || '')
    )
    expect(seriousViolations).toEqual([])
  })

  test('login loads auth on demand and reports rejected credentials', async ({ page }) => {
    await page.route('**/auth/v1/token**', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Invalid login credentials',
        }),
      })
    })
    await page.goto('/login')

    await page.getByLabel('Email').fill('audit@example.invalid')
    await page.getByLabel('Mật khẩu', { exact: true }).fill('not-a-real-password')
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()

    await expect(page.getByText('Invalid login credentials', { exact: true })).toBeVisible()
  })

  test('PWA manifest and generated icons are available', async ({ request }) => {
    const manifestResponse = await request.get('/manifest.webmanifest')
    expect(manifestResponse.ok()).toBeTruthy()
    const manifest = (await manifestResponse.json()) as {
      display?: string
      start_url?: string
      icons?: Array<{ sizes?: string; src?: string; purpose?: string }>
    }

    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/chats')
    expect(manifest.icons?.map((icon) => icon.sizes)).toEqual(
      expect.arrayContaining(['192x192', '512x512'])
    )
    expect(manifest.icons?.map((icon) => icon.src)).toEqual(
      expect.arrayContaining([
        '/icons/chatly-192.png',
        '/icons/chatly-512.png',
        '/icons/chatly-maskable-512.png',
      ])
    )

    const iconResponse = await request.get('/pwa-icon/192')
    expect(iconResponse.ok()).toBeTruthy()
    expect(iconResponse.headers()['content-type']).toContain('image/png')

    const badgeResponse = await request.get('/icons/notification-badge.png')
    expect(badgeResponse.ok()).toBeTruthy()
    expect(badgeResponse.headers()['content-type']).toContain('image/png')
  })

  test('responses include browser security headers', async ({ request }) => {
    const response = await request.get('/login')
    const headers = response.headers()

    expect(headers['content-security-policy']).toContain("object-src 'none'")
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(headers['content-security-policy']).toContain("script-src-attr 'none'")
    expect(headers['content-security-policy']).toContain("worker-src 'self' blob:")
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['x-content-type-options']).toBe('nosniff')
    expect(headers['x-frame-options']).toBe('DENY')
  })

  test('protected settings redirect anonymous visitors to login', async ({ request }) => {
    const response = await request.get('/settings', { maxRedirects: 0 })

    expect([307, 308]).toContain(response.status())
    expect(response.headers().location).toContain('/login')
  })

  test('offline fallback is readable on a narrow screen', async ({ page }) => {
    await page.goto('/offline')
    await expect(page.getByRole('heading', { name: 'Bạn đang ngoại tuyến' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Thử lại' })).toBeVisible()
  })
})

test.describe('service workers unavailable', () => {
  test.use({ serviceWorkers: 'block' })

  test('login does not report a PWA registration error', async ({ page }) => {
    const pwaErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error' && message.text().includes('[PWA]')) {
        pwaErrors.push(message.text())
      }
    })

    await page.goto('/login')
    await page.waitForTimeout(250)

    expect(pwaErrors).toEqual([])
  })
})
