const CACHE_NAME = 'chatly-shell-v7'
const SHELL_ASSETS = [
  '/offline',
  '/manifest.webmanifest',
  '/icons/chatly-192.png',
  '/icons/chatly-512.png',
  '/icons/notification-badge.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((names) =>
          Promise.all(
            names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
          )
        ),
      self.clients.claim(),
    ])
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/offline')))
    return
  }

  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          const copy = response.clone()
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          return response
        })
      })
    )
  }
})

self.addEventListener('push', (event) => {
  let data = {
    title: 'Chatly',
    body: 'Bạn có tin nhắn mới',
    icon: '/icons/chatly-192.png',
    badge: '/icons/notification-badge.png',
    tag: 'chat-notification',
    data: {},
  }

  try {
    if (event.data) {
      const payload = event.data.json()
      data = {
        title: payload.title || data.title,
        body: payload.body || data.body,
        icon: payload.icon || data.icon,
        badge: payload.badge || data.badge,
        tag: payload.tag || data.tag,
        data: payload.data || {},
      }
    }
  } catch (error) {
    console.error('[SW] Invalid push payload:', error)
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const isIncomingCall = data.data?.type === 'call'
      if (isIncomingCall) {
        clients.forEach((client) => {
          client.postMessage({
            type: 'CHATLY_INCOMING_CALL',
            sessionId: data.data?.sessionId,
            conversationId: data.data?.conversationId,
          })
        })
      }
      if (!isIncomingCall && clients.some((client) => client.visibilityState === 'visible')) {
        return undefined
      }
      return self.registration.showNotification(data.title, {
        body: data.body,
        icon: data.icon,
        badge: data.badge,
        tag: data.tag,
        data: data.data,
        timestamp: Date.now(),
        renotify: true,
        requireInteraction: data.data?.type === 'call',
        silent: false,
        vibrate: data.data?.type === 'call' ? [800, 300, 800, 300, 800] : [200, 100, 200],
        actions: [
          { action: 'open', title: 'Mở Chatly' },
          { action: 'dismiss', title: 'Đóng' },
        ],
      })
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'dismiss') return

  const conversationId = event.notification.data?.conversationId
  const messageId = event.notification.data?.messageId
  const fallbackPath = conversationId
    ? `/chats/${encodeURIComponent(conversationId)}${
        messageId ? `?scrollTo=${encodeURIComponent(messageId)}` : ''
      }`
    : '/chats'
  const targetUrl = new URL(event.notification.data?.url || fallbackPath, self.location.origin).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('navigate' in client && 'focus' in client) {
          client.postMessage({ type: 'CHATLY_NAVIGATE', url: targetUrl })
          return client
            .navigate(targetUrl)
            .catch(() => client)
            .then(() => client.focus())
        }
      }
      return self.clients.openWindow
        ? self.clients.openWindow(targetUrl).then((client) => client?.focus())
        : undefined
    })
  )
})
