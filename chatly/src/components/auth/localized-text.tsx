'use client'

import { useI18n } from '@/lib/i18n'

export function LocalizedText({ translationKey }: { translationKey: string }) {
  const { t } = useI18n()
  return <>{t(translationKey)}</>
}
