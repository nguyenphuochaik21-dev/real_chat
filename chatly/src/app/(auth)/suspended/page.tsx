'use client'

import { Ban } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { removeCurrentPushSubscription } from '@/lib/push'

export default function SuspendedPage() {
  const { t } = useI18n()
  const router = useRouter()

  const signOut = async () => {
    await removeCurrentPushSubscription().catch(() => undefined)
    await createClient().auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <div className="w-full rounded-2xl border border-red-500/20 bg-[var(--bg-panel)] p-8 text-center shadow-sm">
      <Ban className="mx-auto h-12 w-12 text-red-500" />
      <h1 className="mt-4 text-2xl font-bold text-[var(--text-primary)]">
        {t('admin.accountSuspended')}
      </h1>
      <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
        {t('admin.accountSuspendedHint')}
      </p>
      <Button variant="outline" className="mt-6" onClick={() => void signOut()}>
        {t('settings.signOut')}
      </Button>
    </div>
  )
}
