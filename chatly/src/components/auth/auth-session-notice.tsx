'use client'

import { useEffect } from 'react'
import { consumeAuthNotice, type AuthNotice } from '@/lib/auth-notice'
import { useI18n } from '@/lib/i18n'
import { useNotificationStore } from '@/stores/notification-store'

const chatNotices = [
  'signed-in',
  'account-created',
  'password-updated',
] as const satisfies readonly AuthNotice[]
type ChatNotice = (typeof chatNotices)[number]

export function AuthSessionNotice() {
  const { t } = useI18n()
  const addToast = useNotificationStore((state) => state.addToast)

  useEffect(() => {
    const notice = consumeAuthNotice([...chatNotices]) as ChatNotice | null
    if (!notice) return

    const messages: Record<(typeof chatNotices)[number], { title: string; body: string }> = {
      'signed-in': {
        title: t('auth.noticeSignedInTitle'),
        body: t('auth.noticeSignedInBody'),
      },
      'account-created': {
        title: t('auth.noticeCreatedTitle'),
        body: t('auth.noticeCreatedBody'),
      },
      'password-updated': {
        title: t('auth.noticePasswordTitle'),
        body: t('auth.noticePasswordBody'),
      },
    }

    addToast({ type: 'system', ...messages[notice] })
  }, [addToast, t])

  return null
}
