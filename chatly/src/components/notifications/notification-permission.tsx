'use client'

import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'
import { ensurePushSubscription } from '@/lib/push'

export function NotificationPermission() {
  const { t } = useI18n()
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [mounted, setMounted] = useState(false)
  const [supported, setSupported] = useState(true)
  const [pushReady, setPushReady] = useState<boolean | null>(null)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setMounted(true)
      setSupported('Notification' in window && 'PushManager' in window)
      if ('Notification' in window) {
        setPermission(Notification.permission)
        if (Notification.permission === 'granted') {
          void ensurePushSubscription()
            .then(setPushReady)
            .catch((error: unknown) => {
              setPushReady(false)
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
      if (result === 'granted') setPushReady(await ensurePushSubscription())
    } catch (error) {
      setPushReady(false)
      console.warn('Failed to enable push notifications:', error)
    }
  }

  // Don't render anything if already granted or denied
  if (!mounted || (permission === 'granted' && pushReady !== false)) {
    return null
  }

  if (!supported || permission === 'denied' || pushReady === false) {
    return (
      <p
        role="status"
        className="mx-3 mb-2 rounded-lg border border-[var(--border-default)] p-3 text-xs text-[var(--text-muted)]"
      >
        {!supported
          ? 'Trên iPhone/iPad: thêm Chatly vào Màn hình chính, mở ứng dụng rồi bật thông báo. Thiết bị cần hỗ trợ Web Push.'
          : permission === 'denied'
            ? 'Thông báo đang bị chặn. Hãy bật quyền thông báo cho Chatly trong cài đặt trình duyệt.'
            : 'Ứng dụng đang phát triển thêm AI Agent và các tính năng khác. Thông báo sẽ được bật khi các tính năng này sẵn sàng.'}
      </p>
    )
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
