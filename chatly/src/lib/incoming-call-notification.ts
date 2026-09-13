export function showIncomingCallNotification(
  sessionId: string,
  conversationId: string,
  name: string,
  video: boolean
) {
  let cancelled = false
  let notification: Notification | undefined
  const tag = `call-${sessionId}`
  const display = async () => {
    if (
      !('Notification' in window) ||
      Notification.permission !== 'granted' ||
      document.visibilityState === 'visible'
    )
      return
    const registration =
      'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
    if (cancelled) return
    const options: NotificationOptions = {
      body: video ? 'Cuộc gọi video đến' : 'Cuộc gọi thoại đến',
      icon: '/icons/chatly-192.png',
      badge: '/icons/notification-badge.png',
      tag,
      requireInteraction: true,
      data: {
        type: 'call',
        sessionId,
        conversationId,
        url: `/chats/${conversationId}?incomingCall=${sessionId}`,
      },
    }
    if (registration) {
      if ((await registration.getNotifications({ tag })).length || cancelled) return
      await registration.showNotification(name, options)
      if (cancelled) (await registration.getNotifications({ tag })).forEach((item) => item.close())
    } else {
      notification = new Notification(name, options)
      notification.onclick = () => {
        window.focus()
        notification?.close()
      }
    }
  }
  const onHidden = () => void display().catch(() => undefined)
  onHidden()
  document.addEventListener('visibilitychange', onHidden)
  return () => {
    cancelled = true
    document.removeEventListener('visibilitychange', onHidden)
    notification?.close()
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker
        .getRegistration()
        .then(async (registration) => {
          const notifications = await registration?.getNotifications({ tag })
          notifications?.forEach((item) => item.close())
        })
        .catch(() => undefined)
    }
  }
}
