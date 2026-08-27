// Service Worker for Push Notifications
const CACHE_NAME = 'chatly-push-v1'

self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker')
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker')
  event.waitUntil(self.clients.claim())
})

// Handle push notifications
self.addEventListener('push', (event) => {
  console.log('[SW] Push received:', event)

  let data = {
    title: 'New message',
    body: 'You have a new message',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: 'chat-notification',
    data: {}
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
        data: payload.data || {}
      }
    }
  } catch (e) {
    console.error('[SW] Error parsing push data:', e)
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    data: data.data,
    vibrate: [200, 100, 200],
    requireInteraction: false,
    actions: [
      {
        action: 'open',
        title: 'Open Chat'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  }

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  )
})

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action)

  event.notification.close()

  if (event.action === 'dismiss') {
    return
  }

  // Open or focus the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window open
      for (const client of clientList) {
        if (client.url.includes('/chats') && 'focus' in client) {
          // If the notification has conversation data, navigate to it
          if (event.notification.data?.conversationId) {
            client.navigate(`/chats/${event.notification.data.conversationId}`)
            return client.focus()
          }
          return client.focus()
        }
      }
      // If no window is open, create one
      if (clients.openWindow) {
        const url = event.notification.data?.conversationId
          ? `/chats/${event.notification.data.conversationId}`
          : '/chats'
        return clients.openWindow(url)
      }
    })
  )
})

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed')
})
