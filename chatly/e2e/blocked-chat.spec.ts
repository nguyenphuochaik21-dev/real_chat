import { expect, test } from '@playwright/test'
import { parseConversationSummaries } from '../src/lib/conversation-summary'
import { useChatsListStore } from '../src/stores/chats-list-store'
import { provisionCallUsers } from './support/call-users'

test.use({ trace: 'off' })

test('blocking preserves active and archived conversations through refresh and realtime updates', () => {
  const store = useChatsListStore.getState()
  store.reset()
  try {
    store.beginUserSession('owner')
    const [active, archived] = parseConversationSummaries([
      { id: 'active', participant: { id: 'peer' } },
      { id: 'archived', participant: { id: 'peer' }, is_archived: true },
    ])
    const data = {
      conversations: [active],
      archivedConversations: [archived],
      participantStatuses: new Map(),
    }
    store.setAll('owner', data)
    store.markUserBlocked('peer')
    store.setBlockedUserIds('owner', new Set(['peer']))
    store.setAll('owner', data)
    store.upsertConversation({ ...active, unread_count: 2 })
    store.upsertConversation({ ...archived, unread_count: 3 })
    expect(useChatsListStore.getState().conversations).toEqual([{ ...active, unread_count: 2 }])
    expect(useChatsListStore.getState().archivedConversations).toEqual([
      { ...archived, unread_count: 3 },
    ])
    expect(useChatsListStore.getState().blockedUserIds.has('peer')).toBe(true)
    store.unmarkUserBlocked('peer')
    expect(useChatsListStore.getState().conversations).toHaveLength(1)
    expect(useChatsListStore.getState().blockedUserIds.has('peer')).toBe(false)
    store.removeConversation('active')
    expect(useChatsListStore.getState().conversations).toHaveLength(0)
  } finally {
    store.reset()
  }
})

test('blocked chat stays visible after reload, keeps history and can be unblocked', async ({
  page,
}, testInfo) => {
  test.skip(process.env.E2E_DATABASE_CALLS !== 'true', 'Opt in to temporary database accounts')
  test.skip(testInfo.project.name !== 'chromium', 'Desktop sidebar and chat visible together')
  test.setTimeout(90_000)
  const fixture = await provisionCallUsers()
  try {
    const [owner, peer] = fixture.users
    const history = 'Message before blocking'
    await fixture.db.query(
      'insert into public.messages(conversation_id,sender_id,content) values ($1,$2,$3)',
      [fixture.conversationId, peer.id, history]
    )
    await page.goto('/login')
    await page.getByLabel('Email').fill(owner.email)
    await page.getByLabel('Mật khẩu', { exact: true }).fill(owner.password)
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
    await expect(page).toHaveURL(/\/chats/, { timeout: 20_000 })
    const chatPath = `/chats/${fixture.conversationId}`
    const chatLink = page.locator(`a[href="${chatPath}"]`)
    await chatLink.click()
    await page.getByRole('button', { name: 'Tùy chọn cuộc trò chuyện' }).click()
    await page.getByRole('button', { name: 'Chặn người dùng', exact: true }).click()
    await page.getByRole('button', { name: 'Chặn', exact: true }).click()
    const unblock = page.getByRole('button', { name: 'Bỏ chặn', exact: true })
    await expect(unblock).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`${chatPath}$`))
    await expect(chatLink).toBeVisible()
    await page.reload()
    await expect(chatLink).toBeVisible()
    await expect(unblock).toBeVisible()
    await expect(page.getByText(history, { exact: true }).last()).toBeVisible()
    await expect(page.locator('textarea')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Gọi thoại', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Gọi video', exact: true })).toBeDisabled()

    await page.getByRole('button', { name: 'Tùy chọn cuộc trò chuyện' }).click()
    await page.getByRole('button', { name: 'Lưu trữ', exact: true }).last().click()
    await expect(page.getByRole('button', { name: 'Lưu trữ', exact: true })).toHaveCount(1)
    await page.getByRole('button', { name: 'Lưu trữ', exact: true }).click()
    await expect(chatLink).toBeVisible()
    await page.reload()
    await page.getByRole('button', { name: 'Lưu trữ', exact: true }).click()
    await expect(chatLink).toBeVisible()
    await unblock.click()
    await expect(page.locator('textarea')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Gọi thoại', exact: true })).toBeEnabled()
    await expect(chatLink).toBeVisible()
  } finally {
    await page.context().close()
    await fixture.cleanup()
  }
})
