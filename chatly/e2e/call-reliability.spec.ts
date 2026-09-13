import { expect, test } from '@playwright/test'
import { readCallMessage } from '../src/lib/call-message'
import { supportedPreviewUrl } from '../src/lib/preview-url'
import { useCallStore } from '../src/stores/call-store'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

test('call metadata is safe for missing, legacy and invalid durations', () => {
  expect(readCallMessage({ duration_seconds: 12.9, answered: true }).duration).toBe(12)
  expect(readCallMessage({ duration_seconds: -1 }).duration).toBe(0)
  expect(readCallMessage({ duration_seconds: Infinity }).duration).toBe(0)
  expect(readCallMessage(null).answered).toBe(false)
  expect(readCallMessage([]).status).toBe('ended')
})

test('call timer counts elapsed time and excludes the ringing period', () => {
  const store = useCallStore.getState()
  store.reset()
  store.receiveCall('call', 'conversation', { id: 'peer', displayName: 'Peer' }, 'voice')
  store.acceptCall()
  expect(useCallStore.getState().startedAt).toBeNull()
  store.setConnected()
  useCallStore.setState({ startedAt: new Date(Date.now() - 12_000) })
  store.updateDuration()
  expect(useCallStore.getState().duration).toBe(12)
  store.reset()
})

test('unsupported preview hosts and alternate ports never trigger preview fetches', () => {
  for (const url of [
    'https://www.facebook.com/np.hai.0403',
    'https://127.0.0.1',
    'http://github.com',
    'https://github.com:8080',
    'https://user:pass@github.com',
    'https://github.com.evil.invalid',
  ]) {
    expect(supportedPreviewUrl(url)).toBeNull()
  }
  expect(supportedPreviewUrl('https://github.com/openai')?.hostname).toBe('github.com')
})

test('push configuration exposes only public readiness information', async ({ request }) => {
  const response = await request.get('/api/push/config')
  expect(response.ok()).toBeTruthy()
  const value = await response.json()
  expect(Object.keys(value).sort()).toEqual(['configured', 'publicKey'])
  expect(typeof value.configured).toBe('boolean')
  if (!value.configured) expect(value.publicKey).toBeNull()
})

test('call notification click focuses the current window without reloading a live call', async () => {
  const handlers: Record<string, (event: unknown) => void> = {}
  const events: string[] = []
  let pending: Promise<unknown> | undefined
  runInNewContext(readFileSync('public/sw.js', 'utf8'), {
    URL,
    console,
    self: {
      location: { origin: 'https://chatly.example' },
      addEventListener: (name: string, callback: (event: unknown) => void) => {
        handlers[name] = callback
      },
      clients: {
        matchAll: async () => [
          {
            url: 'https://chatly.example/chats',
            postMessage: (value: { type: string }) => events.push(value.type),
            navigate: () => {
              events.push('navigate')
              return Promise.resolve()
            },
            focus: () => {
              events.push('focus')
              return Promise.resolve()
            },
          },
        ],
      },
    },
  })
  handlers.notificationclick({
    notification: {
      close: () => undefined,
      data: { type: 'call', sessionId: 'session', conversationId: 'chat', url: '/chats/chat' },
    },
    waitUntil: (promise: Promise<unknown>) => {
      pending = promise
    },
  })
  await pending
  expect(events).toEqual(['CHATLY_INCOMING_CALL', 'focus'])
})
