import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test.describe('public application shell', () => {
  test('login is responsive and has no serious accessibility violations', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByRole('heading', { name: 'Đăng nhập Chatly' })).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Mật khẩu', { exact: true })).toBeVisible()

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const seriousViolations = results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact || '')
    )
    expect(seriousViolations).toEqual([])
  })

  test('PWA manifest and generated icons are available', async ({ request }) => {
    const manifestResponse = await request.get('/manifest.webmanifest')
    expect(manifestResponse.ok()).toBeTruthy()
    const manifest = (await manifestResponse.json()) as {
      display?: string
      start_url?: string
      icons?: Array<{ sizes?: string }>
    }

    expect(manifest.display).toBe('standalone')
    expect(manifest.start_url).toBe('/chats')
    expect(manifest.icons?.map((icon) => icon.sizes)).toEqual(
      expect.arrayContaining(['192x192', '512x512'])
    )

    const iconResponse = await request.get('/pwa-icon/192')
    expect(iconResponse.ok()).toBeTruthy()
    expect(iconResponse.headers()['content-type']).toContain('image/png')
  })

  test('responses include browser security headers', async ({ request }) => {
    const response = await request.get('/login')
    const headers = response.headers()

    expect(headers['content-security-policy']).toContain("object-src 'none'")
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
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
