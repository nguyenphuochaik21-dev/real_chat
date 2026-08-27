'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useNotificationStore } from '@/stores/notification-store'

export function NotificationPermission() {
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission)
    }
  }, [])

  const requestPermission = async () => {
    if (!('Notification' in window)) {
      console.log('Browser notifications not supported')
      return
    }

    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      console.log('Notification permission:', result)
    } catch (error) {
      console.error('Failed to request notification permission:', error)
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
          <p className="text-sm text-[var(--text-primary)]">Enable notifications</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Get notified when you receive messages
          </p>
        </div>
        <Button
          size="sm"
          variant="default"
          onClick={requestPermission}
          className="shrink-0"
        >
          Enable
        </Button>
      </div>
    </div>
  )
}

// Hook to check and request notification permission
export function useBrowserNotificationPermission() {
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission)
    }
  }, [])

  const requestPermission = async (): Promise<boolean> => {
    if (!mounted || !('Notification' in window)) return false

    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      return result === 'granted'
    } catch (error) {
      console.error('Failed to request permission:', error)
      return false
    }
  }

  return {
    permission,
    isSupported: mounted && typeof window !== 'undefined' && 'Notification' in window,
    isGranted: permission === 'granted',
    isDenied: permission === 'denied',
    requestPermission,
  }
}
