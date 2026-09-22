import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { provisionCallUsers } from './support/call-users'

test.use({ trace: 'off' })

test('avatar replacement and owner-only group deletion reclaim storage', async () => {
  test.skip(process.env.E2E_DATABASE_CALLS !== 'true', 'Requires temporary database accounts')
  test.setTimeout(60_000)
  const fixture = await provisionCallUsers()
  const [owner] = fixture.users
  const clients = fixture.users.map(() =>
    createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
  )
  const [a, b] = clients
  const avatarPath = `${owner.id}/cleanup-test.png`
  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
    'base64'
  )
  let groupId: string | undefined
  let groupPath: string | undefined
  try {
    for (const [index, client] of clients.entries())
      expect((await client.auth.signInWithPassword(fixture.users[index])).error).toBeNull()
    expect(
      (
        await a.storage
          .from('profile-avatars')
          .upload(avatarPath, image, { contentType: 'image/png' })
      ).error
    ).toBeNull()
    const avatar = a.storage.from('profile-avatars').getPublicUrl(avatarPath).data.publicUrl
    expect(
      (await a.from('profiles').update({ avatar_url: avatar }).eq('id', owner.id)).error
    ).toBeNull()
    expect((await a.rpc('pending_storage_cleanup')).data).toEqual([])
    expect(
      (await a.from('profiles').update({ avatar_url: null }).eq('id', owner.id)).error
    ).toBeNull()
    expect((await a.rpc('pending_storage_cleanup')).data).toContainEqual({
      bucket_id: 'profile-avatars',
      object_name: avatarPath,
    })
    expect((await a.storage.from('profile-avatars').remove([avatarPath])).error).toBeNull()
    expect((await a.storage.from('profile-avatars').info(avatarPath)).error).not.toBeNull()
    // Seed a two-member remaining group; creation's three-person minimum is tested separately.
    groupId = fixture.conversationId
    await fixture.db.query(
      "update public.conversations set type='group',title='Cleanup test' where id=$1",
      [groupId]
    )
    await fixture.db.query(
      "update public.conversation_participants set role='owner' where conversation_id=$1 and user_id=$2",
      [groupId, owner.id]
    )
    groupPath = `${owner.id}/${groupId}/cleanup-test.png`
    expect(
      (await a.storage.from('chat-media').upload(groupPath, image, { contentType: 'image/png' }))
        .error
    ).toBeNull()
    expect(
      (
        await a.from('messages').insert({
          conversation_id: groupId,
          sender_id: owner.id,
          content: 'group image',
          content_type: 'image',
          media_url: groupPath,
          media_mime_type: 'image/png',
        })
      ).error
    ).toBeNull()
    expect(
      (await b.rpc('delete_conversation_permanently', { p_conversation_id: groupId })).error
    ).not.toBeNull()
    expect(
      (await a.rpc('delete_conversation_permanently', { p_conversation_id: groupId })).error
    ).toBeNull()
    expect((await a.rpc('pending_storage_cleanup')).data).toContainEqual({
      bucket_id: 'chat-media',
      object_name: groupPath,
    })
    expect((await a.storage.from('chat-media').remove([groupPath])).error).toBeNull()
    expect((await a.storage.from('chat-media').info(groupPath)).error).not.toBeNull()
  } finally {
    await fixture.db.query('update public.profiles set avatar_url=null where id=$1', [owner.id])
    if (groupId)
      await fixture.db.query('delete from public.conversations where id=$1 and created_by=$2', [
        groupId,
        owner.id,
      ])
    if (groupPath) await a.storage.from('chat-media').remove([groupPath])
    await a.storage.from('profile-avatars').remove([avatarPath])
    await a.rpc('pending_storage_cleanup')
    await fixture.cleanup()
    for (const client of clients) await client.auth.signOut({ scope: 'local' })
  }
})

test('personal chat deletion, shared attachments, physical cleanup and downloads', async ({
  page,
}) => {
  test.skip(process.env.E2E_DATABASE_CALLS !== 'true', 'Requires temporary database accounts')
  test.setTimeout(120_000)
  const fixture = await provisionCallUsers()
  const [owner, peer] = fixture.users
  const clients = fixture.users.map(() =>
    createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
  )
  const [a, b] = clients
  const path = `${owner.id}/${fixture.conversationId}/deletion-test.pdf`
  const ownPath = `${owner.id}/${fixture.conversationId}/own-delete.pdf`
  const content = Buffer.from('%PDF-1.4\nChatly download fixture\n%%EOF')
  try {
    for (const [index, client] of clients.entries()) {
      expect((await client.auth.signInWithPassword(fixture.users[index])).error).toBeNull()
    }
    expect(
      (await a.storage.from('chat-media').upload(path, content, { contentType: 'application/pdf' }))
        .error
    ).toBeNull()
    const first = await a
      .from('messages')
      .insert({
        conversation_id: fixture.conversationId,
        sender_id: owner.id,
        content: 'deletion-test.pdf',
        content_type: 'file',
        media_url: path,
        media_name: 'deletion-test.pdf',
        media_mime_type: 'application/pdf',
        media_size: content.length,
      })
      .select()
      .single()
    expect(first.error).toBeNull()
    const id = first.data!.id
    // A forwarded reference must prevent deleting the shared object.
    const forwarded = await b
      .from('messages')
      .insert({
        conversation_id: fixture.conversationId,
        sender_id: peer.id,
        content: 'forwarded file',
        content_type: 'file',
        media_url: path,
        media_name: 'deletion-test.pdf',
        media_mime_type: 'application/pdf',
      })
      .select()
      .single()
    expect(forwarded.error).toBeNull()
    const reply = await b
      .from('messages')
      .insert({
        conversation_id: fixture.conversationId,
        sender_id: peer.id,
        content: 'reply',
        reply_to: id,
      })
      .select()
      .single()
    expect(reply.error).toBeNull()
    expect((await b.rpc('delete_own_message', { p_message_id: id })).error).not.toBeNull()
    expect((await a.rpc('delete_own_message', { p_message_id: id })).error).toBeNull()
    expect(
      (await b.from('messages').select('reply_to').eq('id', reply.data!.id).single()).data?.reply_to
    ).toBeNull()
    expect((await a.storage.from('chat-media').download(path)).error).toBeNull()
    // Even the uploader cannot remove a live forwarded attachment through Storage API.
    await a.storage.from('chat-media').remove([path])
    expect((await b.storage.from('chat-media').download(path)).error).toBeNull()

    await page.goto('/login')
    await page.locator('#email').fill(owner.email)
    await page.locator('#password').fill(owner.password)
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await expect(page).toHaveURL(/\/chats/, { timeout: 20_000 })
    await page.goto(`/chats/${fixture.conversationId}`)
    const downloadEvent = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Tải xuống', exact: true }).first().click()
    const download = await downloadEvent
    expect(download.suggestedFilename()).toBe('deletion-test.pdf')
    expect(await download.failure()).toBeNull()
    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
    expect(Buffer.concat(chunks).equals(content)).toBe(true)

    await page.getByRole('heading', { name: /^Call Receiver$/i }).click({ timeout: 10_000 })
    await page.getByRole('button', { name: 'File phương tiện', exact: true }).click()
    const gallery = page.getByRole('dialog', { name: 'Ảnh, video và tệp' })
    const galleryDownloadEvent = page.waitForEvent('download')
    await gallery.getByRole('button', { name: 'Tải xuống', exact: true }).click()
    expect(await (await galleryDownloadEvent).failure()).toBeNull()
    await gallery.getByRole('button', { name: 'Đóng' }).click()

    expect(
      (
        await a.rpc('delete_conversation_permanently', {
          p_conversation_id: fixture.conversationId,
        })
      ).error
    ).toBeNull()
    expect(
      (await a.from('messages').select('id').eq('conversation_id', fixture.conversationId)).data
    ).toEqual([])
    expect(
      (await b.from('messages').select('id').eq('conversation_id', fixture.conversationId)).data
    ).toHaveLength(2)
    expect((await a.rpc('get_conversation_summaries')).data).toEqual([])
    expect((await b.rpc('get_conversation_summaries')).data).toHaveLength(1)
    expect((await b.storage.from('chat-media').download(path)).error).toBeNull()

    // Explicitly reopening does not restore cleared history.
    expect(
      (await a.rpc('get_or_create_direct_conversation', { p_other_user_id: peer.id })).error
    ).toBeNull()
    expect(
      (await a.from('messages').select('id').eq('conversation_id', fixture.conversationId)).data
    ).toEqual([])
    expect((await a.rpc('get_conversation_summaries')).data[0].last_message).toBeNull()
    expect(
      (
        await a.rpc('delete_conversation_permanently', {
          p_conversation_id: fixture.conversationId,
        })
      ).error
    ).toBeNull()
    expect(
      (
        await b.from('messages').insert({
          conversation_id: fixture.conversationId,
          sender_id: peer.id,
          content: 'new message after clearing',
        })
      ).error
    ).toBeNull()
    expect((await a.rpc('get_conversation_summaries')).data).toHaveLength(1)
    expect(
      (await a.from('messages').select('id').eq('conversation_id', fixture.conversationId)).data
    ).toHaveLength(1)

    // Only after both sides clear do shared rows and attachments become removable.
    expect(
      (
        await a.rpc('delete_conversation_permanently', {
          p_conversation_id: fixture.conversationId,
        })
      ).error
    ).toBeNull()
    expect(
      (
        await b.rpc('delete_conversation_permanently', {
          p_conversation_id: fixture.conversationId,
        })
      ).error
    ).toBeNull()
    expect(
      (
        await fixture.db.query('select id from public.messages where conversation_id=$1', [
          fixture.conversationId,
        ])
      ).rowCount
    ).toBe(0)
    const jobs = await b.rpc('pending_storage_cleanup')
    expect(jobs.error).toBeNull()
    expect(jobs.data).toContainEqual({ bucket_id: 'chat-media', object_name: path })
    expect((await b.storage.from('chat-media').remove([path])).error).toBeNull()
    expect(
      (
        await fixture.db.query('select id from storage.objects where bucket_id=$1 and name=$2', [
          'chat-media',
          path,
        ])
      ).rowCount
    ).toBe(0)
    // Object bytes are deleted through Storage API; prior CDN downloads may remain cached until TTL.
    expect((await b.storage.from('chat-media').info(path)).error).not.toBeNull()
    expect((await b.rpc('pending_storage_cleanup')).data).toEqual([])

    expect(
      (
        await a.storage
          .from('chat-media')
          .upload(ownPath, content, { contentType: 'application/pdf' })
      ).error
    ).toBeNull()
    const owned = await a
      .from('messages')
      .insert({
        conversation_id: fixture.conversationId,
        sender_id: owner.id,
        content: 'own-delete.pdf',
        content_type: 'file',
        media_url: ownPath,
        media_name: 'own-delete.pdf',
        media_mime_type: 'application/pdf',
      })
      .select()
      .single()
    expect(owned.error).toBeNull()
    await page.goto(`/chats/${fixture.conversationId}`)
    await page.getByText('own-delete.pdf', { exact: true }).click({ button: 'right' })
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Xóa', exact: true }).click()
    await expect(page.locator(`[data-message-id="${owned.data!.id}"]`)).toHaveCount(0)
    await expect
      .poll(
        async () =>
          (
            await fixture.db.query(
              'select id from storage.objects where bucket_id=$1 and name=$2',
              ['chat-media', ownPath]
            )
          ).rowCount
      )
      .toBe(0)
  } finally {
    await fixture.db.query('delete from public.messages where conversation_id=$1', [
      fixture.conversationId,
    ])
    await a.storage.from('chat-media').remove([path, ownPath])
    await fixture.cleanup()
    for (const client of clients) await client.auth.signOut({ scope: 'local' })
  }
})
