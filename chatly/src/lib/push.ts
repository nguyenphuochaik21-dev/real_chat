let configuration: Promise<{ configured: boolean; publicKey: string | null }> | null = null
let configurationAt = 0

export function getPushConfiguration() {
  if (!configuration || Date.now() - configurationAt > 60_000) {
    configurationAt = Date.now()
    configuration = fetch('/api/push/config', { signal: AbortSignal.timeout(5000) })
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as { configured: boolean; publicKey: string | null })
          : { configured: false, publicKey: null }
      )
      .catch(() => ({ configured: false, publicKey: null }))
  }
  return configuration
}

function decodeVapidPublicKey(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const bytes = window.atob(base64)
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0))
}

export async function ensurePushSubscription() {
  if (
    !('Notification' in window) ||
    Notification.permission !== 'granted' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    return false
  }

  const { configured, publicKey } = await getPushConfiguration()
  if (!configured || !publicKey) return false

  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration?.active) return false
  let existing = await registration.pushManager.getSubscription()
  if (existing?.options.applicationServerKey) {
    const currentKey = new Uint8Array(existing.options.applicationServerKey)
    const expectedKey = decodeVapidPublicKey(publicKey)
    if (
      currentKey.length !== expectedKey.length ||
      currentKey.some((byte, index) => byte !== expectedKey[index])
    ) {
      await existing.unsubscribe()
      existing = null
    }
  }
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidPublicKey(publicKey),
    }))
  const serialized = subscription.toJSON()
  if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys.auth) return false

  const response = await fetch('/api/push/subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      endpoint: serialized.endpoint,
      p256dh: serialized.keys.p256dh,
      auth: serialized.keys.auth,
    }),
  })
  if (!response.ok) throw new Error('Could not save push subscription')
  return true
}

export function queuePushNotification(messageId: string) {
  if (typeof window === 'undefined') return

  void getPushConfiguration()
    .then((config) =>
      config.configured
        ? fetch('/api/push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messageId }),
            credentials: 'same-origin',
            keepalive: true,
          })
        : undefined
    )
    .catch(() => {
      // Push delivery is best-effort and must never block sending a message.
    })
}

export function queueCallPushNotification(sessionId: string) {
  if (typeof window === 'undefined') return

  void getPushConfiguration()
    .then((config) =>
      config.configured
        ? fetch('/api/push/call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
            credentials: 'same-origin',
            keepalive: true,
          })
        : undefined
    )
    .catch(() => undefined)
}

export function queueSupportPushNotification(requestId: string, event: 'created' | 'updated') {
  if (typeof window === 'undefined') return

  void getPushConfiguration()
    .then((config) =>
      config.configured
        ? fetch('/api/push/support', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requestId, event }),
            credentials: 'same-origin',
            keepalive: true,
          })
        : undefined
    )
    .catch(() => undefined)
}

export async function removeCurrentPushSubscription() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration?.active) return
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  await fetch('/api/push/subscription', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
    credentials: 'same-origin',
  })
  await subscription.unsubscribe()
}
