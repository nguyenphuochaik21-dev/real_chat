'use client'

import { useEffect, useState } from 'react'
import { Download, WifiOff, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n()
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installDismissed, setInstallDismissed] = useState(false)
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const onlineStatusTimeout = window.setTimeout(() => setOnline(navigator.onLine), 0)
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
        console.error('[PWA] Service worker registration failed:', error)
      })
    }

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }
    const handleInstalled = () => setInstallPrompt(null)
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)

    window.addEventListener('beforeinstallprompt', handleInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.clearTimeout(onlineStatusTimeout)
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
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
