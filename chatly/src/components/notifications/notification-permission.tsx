'use client'

import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

function decodeVapidPublicKey(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const bytes = window.atob(base64)
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0))
}

async function subscribeToPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!publicKey || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[Push] VAPID or PushManager is unavailable')
    return
  }

  const registration = await navigator.serviceWorker.ready
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeVapidPublicKey(publicKey),
    }))
  const serialized = subscription.toJSON()
  if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys.auth) return

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
  if (!response.ok) {
    await subscription.unsubscribe()
    throw new Error('Could not save push subscription')
  }
}

export function NotificationPermission() {
  const { t } = useI18n()
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setMounted(true)
      if ('Notification' in window) {
        setPermission(Notification.permission)
        if (Notification.permission === 'granted') {
          void subscribeToPush().catch((error: unknown) => {
            console.warn('[Push] Could not save subscription:', error)
          })
        }
      }
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [])

  const requestPermission = async () => {
    if (!('Notification' in window)) {
      console.log('Browser notifications not supported')
      return
    }

    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      if (result === 'granted') await subscribeToPush()
    } catch (error) {
      console.warn('Failed to enable push notifications:', error)
    }
  }

  // Don't render anything if already granted or denied
  if (!mounted || permission === 'granted' || permission === 'denied') {
    return null
  }

  return (
    <div className="mx-3 mb-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-hover)] p-3">
      <div className="flex items-start gap-3">
        <Bell className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
        <div className="flex-1">
          <p className="text-sm text-[var(--text-primary)]">{t('notifications.enable')}</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">{t('notifications.enableHint')}</p>
        </div>
        <Button size="sm" variant="default" onClick={requestPermission} className="shrink-0">
          {t('notifications.enable')}
        </Button>
      </div>
    </div>
  )
}
