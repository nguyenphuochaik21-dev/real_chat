'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, MailCheck } from 'lucide-react'
import { AuthFeedback } from '@/components/auth/auth-feedback'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useHydrated } from '@/hooks/use-hydrated'
import { useI18n } from '@/lib/i18n'
import { getAuthErrorMessage } from '@/lib/auth-error'

export default function ForgotPasswordPage() {
  const { t } = useI18n()
  const hydrated = useHydrated()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/callback?next=/reset-password`,
    })
    if (resetError) setError(getAuthErrorMessage(resetError, t))
    else setSent(true)
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="text-center">
        <MailCheck className="text-primary-500 mx-auto h-14 w-14" />
        <h1 className="mt-5 text-2xl font-bold text-[var(--text-primary)]">
          {t('auth.resetEmailSent')}
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {t('auth.resetEmailHint', { email })}
        </p>
        <Button variant="outline" className="mt-6" onClick={() => setSent(false)}>
          {t('auth.tryAnotherEmail')}
        </Button>
      </div>
    )
  }

  return (
    <div>
      <Link href="/login" className="text-primary-500 inline-flex items-center gap-2 text-sm">
        <ArrowLeft className="h-4 w-4" />
        {t('common.back')}
      </Link>
      <h1 className="mt-6 text-2xl font-bold text-[var(--text-primary)]">
        {t('auth.resetPasswordTitle')}
      </h1>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">{t('auth.resetPasswordHint')}</p>
      {error && <AuthFeedback message={error} />}
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="reset-email" className="text-sm font-medium text-[var(--text-primary)]">
            {t('auth.email')}
          </label>
          <Input
            id="reset-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1"
            autoComplete="email"
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={!hydrated || loading}>
          {loading ? t('common.loading') : t('auth.sendResetLink')}
        </Button>
      </form>
    </div>
  )
}
