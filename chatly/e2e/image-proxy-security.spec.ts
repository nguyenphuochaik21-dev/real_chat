import { expect, test } from '@playwright/test'

test('image proxy rejects untrusted or unusual upstream URLs', async ({ request }) => {
  for (const url of [
    'http://i.ytimg.com/image.jpg',
    'https://example.com/image.jpg',
    'https://i.ytimg.com:444/image.jpg',
    'https://user:password@i.ytimg.com/image.jpg',
  ]) {
    const response = await request.get(`/api/link-preview/image?url=${encodeURIComponent(url)}`)
    expect(response.status(), url).toBe(404)
  }
})
