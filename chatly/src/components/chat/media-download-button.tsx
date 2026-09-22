'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { downloadMedia } from '@/lib/supabase/storage'
import { useI18n } from '@/lib/i18n'
import { useNotificationStore } from '@/stores/notification-store'
import { cn } from '@/lib/utils'

export function MediaDownloadButton({
  path,
  filename,
  className,
}: {
  path: string
  filename: string | null
  className?: string
}) {
  const [busy, setBusy] = useState(false)
  const { t } = useI18n()
  const addToast = useNotificationStore((state) => state.addToast)
  return (
    <button
      type="button"
      aria-label={t('gallery.download')}
      title={t('gallery.download')}
      disabled={busy}
      aria-busy={busy}
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg disabled:opacity-50',
        className
      )}
      onClick={async () => {
        setBusy(true)
        try {
          await downloadMedia(path, filename || 'download')
        } catch {
          addToast({ type: 'system', title: t('gallery.downloadFailed'), body: '' })
        } finally {
          setBusy(false)
        }
      }}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
    </button>
  )
}
