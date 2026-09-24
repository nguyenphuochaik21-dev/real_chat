import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { provisionCallUsers } from './support/call-users'

test('private document opens in chat and gallery while download still works', async ({ page }) => {
  test.skip(process.env.E2E_DATABASE_CALLS !== 'true', 'Requires temporary database accounts')
  test.setTimeout(120_000)
  const fixture = await provisionCallUsers()
  const [owner] = fixture.users
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
  const name = `preview-${crypto.randomUUID()}.txt`
  const path = `${owner.id}/${fixture.conversationId}/${name}`
  const content = 'Chatly private preview test content'
  try {
    expect((await supabase.auth.signInWithPassword(owner)).error).toBeNull()
    expect(
      (
        await supabase.storage
          .from('chat-media')
          .upload(path, new Blob([content], { type: 'text/plain' }), { contentType: 'text/plain' })
      ).error
    ).toBeNull()
    expect(
      (
        await supabase.from('messages').insert({
          conversation_id: fixture.conversationId,
          sender_id: owner.id,
          content: name,
          content_type: 'file',
          media_url: path,
          media_name: name,
          media_mime_type: 'text/plain',
          media_size: content.length,
        })
      ).error
    ).toBeNull()

    await page.goto('/login')
    await page.locator('#email').fill(owner.email)
    await page.locator('#password').fill(owner.password)
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await expect(page).toHaveURL(/\/chats/, { timeout: 20_000 })
    await page.goto(`/chats/${fixture.conversationId}`)

    await page.getByRole('button', { name: `Xem trước ${name}` }).click()
    const preview = page.getByRole('dialog', { name: `Xem trước ${name}` })
    await expect(preview.getByText(content)).toBeVisible()
    const download = page.waitForEvent('download', { timeout: 15_000 })
    await preview.getByRole('button', { name: 'Tải xuống' }).click()
    await expect(page.getByText('Không thể tải tệp. Vui lòng thử lại.')).not.toBeVisible()
    expect((await download).suggestedFilename()).toBe(name)
    await preview.getByRole('button', { name: 'Đóng' }).click()

    await fixture.db.query(
      `insert into public.messages
        (conversation_id,sender_id,content,content_type,media_url,media_name,media_mime_type,media_size,created_at)
       select $1,$2,'page-test-' || n,'file',$3,'page-test-' || n || '.txt',
         'text/plain',$4,now() + n * interval '1 second'
       from generate_series(1,45) as n`,
      [fixture.conversationId, owner.id, path, content.length]
    )
    await page.reload()

    await page.getByRole('heading', { name: /^Call Receiver$/i }).click({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: 'Xem tất cả' })).toBeVisible()
    await page.getByRole('button', { name: 'Xem tất cả' }).click()
    const gallery = page.getByRole('dialog', { name: 'Ảnh, video và tệp' })
    await expect(gallery).toBeVisible()
    await expect(gallery.getByText('Đã chia sẻ 46 tệp')).toBeVisible()
    await gallery.getByRole('button', { name: 'Xem thêm tệp' }).click()
    await expect(gallery.getByRole('button', { name: /Xem trước page-test-/ })).toHaveCount(45)
    await gallery.getByRole('button', { name: `Xem trước ${name}` }).click()
    await expect(
      page.getByRole('dialog', { name: `Xem trước ${name}` }).getByText(content)
    ).toBeVisible()
  } finally {
    await fixture.db.query(
      'delete from public.messages where conversation_id=$1 and media_url=$2',
      [fixture.conversationId, path]
    )
    expect((await supabase.storage.from('chat-media').remove([path])).error).toBeNull()
    expect((await supabase.storage.from('chat-media').info(path)).error).not.toBeNull()
    await supabase.auth.signOut({ scope: 'local' })
    await fixture.cleanup()
  }
})
