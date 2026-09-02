export function queuePushNotification(messageId: string) {
  if (typeof window === 'undefined') return

  void fetch('/api/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId }),
    credentials: 'same-origin',
    keepalive: true,
  }).catch(() => {
    // Push delivery is best-effort and must never block sending a message.
  })
}

export async function removeCurrentPushSubscription() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  const registration = await navigator.serviceWorker.ready
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
