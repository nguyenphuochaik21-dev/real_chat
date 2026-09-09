'use client'

import { useEffect, useRef, useState } from 'react'
import { Download, WifiOff, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'
import { ensurePushSubscription } from '@/lib/push'
import { unlockNotificationAudio } from '@/lib/notification-sounds'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n()
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installDismissed, setInstallDismissed] = useState(false)
  const [online, setOnline] = useState(true)
  const lastPushRefreshRef = useRef(0)

  useEffect(() => {
    const onlineStatusTimeout = window.setTimeout(() => setOnline(navigator.onLine), 0)
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker
        .register('/sw.js')
        .then(async (registration) => {
          await registration.update()
          if ('Notification' in window && Notification.permission === 'granted') {
            await ensurePushSubscription()
          }
        })
        .catch((error: unknown) => {
          console.error('[PWA] Service worker registration failed:', error)
        })
    }

    const unlockAudio = () => unlockNotificationAudio()
    const refreshPushSubscription = () => {
      if (
        document.visibilityState !== 'visible' ||
        !('Notification' in window) ||
        Notification.permission !== 'granted' ||
        Date.now() - lastPushRefreshRef.current < 60_000
      ) {
        return
      }
      lastPushRefreshRef.current = Date.now()
      void ensurePushSubscription().catch((error: unknown) => {
        console.warn('[PWA] Push subscription refresh failed:', error)
      })
    }

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }
    const handleInstalled = () => setInstallPrompt(null)
    const handleOnline = () => {
      setOnline(true)
      refreshPushSubscription()
    }
    const handleOffline = () => setOnline(false)
    const handleVisibilityChange = () => refreshPushSubscription()
    const handlePageShow = () => refreshPushSubscription()
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      const value = event.data as {
        type?: string
        url?: string
        sessionId?: string
        conversationId?: string
      } | null
      if (value?.type === 'CHATLY_NAVIGATE' && value.url) {
        const target = new URL(value.url, window.location.origin)
        if (target.origin === window.location.origin) window.location.assign(target.href)
        return
      }
      if (value?.type === 'CHATLY_INCOMING_CALL' && value.sessionId) {
        window.dispatchEvent(
          new CustomEvent('chatly:incoming-call', {
            detail: {
              sessionId: value.sessionId,
              conversationId: value.conversationId,
            },
          })
        )
      }
    }

    window.addEventListener('beforeinstallprompt', handleInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('pageshow', handlePageShow)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pointerdown', unlockAudio, { once: true })
    window.addEventListener('keydown', unlockAudio, { once: true })
    navigator.serviceWorker?.addEventListener('message', handleServiceWorkerMessage)

    return () => {
      window.clearTimeout(onlineStatusTimeout)
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('pageshow', handlePageShow)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
      navigator.serviceWorker?.removeEventListener('message', handleServiceWorkerMessage)
    }
  }, [])

  const handleInstall = async () => {
    if (!installPrompt) return
    await installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
  }

  return (
    <>
      {children}
      {!online && (
        <div
          role="status"
          className="fixed top-3 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 shadow-lg"
        >
          <WifiOff className="h-4 w-4" />
          {t('pwa.offline')}
        </div>
      )}
      {installPrompt && !installDismissed && (
        <div className="fixed right-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-[60] flex max-w-[calc(100%-1.5rem)] items-center gap-3 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-panel)] p-3 shadow-xl md:bottom-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{t('pwa.install')}</p>
            <p className="text-xs text-[var(--text-muted)]">{t('pwa.installHint')}</p>
          </div>
          <Button size="sm" onClick={() => void handleInstall()}>
            <Download className="h-4 w-4" />
            {t('pwa.installAction')}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setInstallDismissed(true)}
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </>
  )
}
