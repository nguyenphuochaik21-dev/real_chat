'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n'

export default function ResetPasswordPage() {
  const { t } = useI18n()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (password.length < 8) {
      setError(t('auth.passwordMin'))
      return
    }
    if (password !== confirmation) {
      setError(t('auth.passwordMismatch'))
      return
    }
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }
    router.replace('/chats')
    router.refresh()
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--text-primary)]">
        {t('auth.chooseNewPassword')}
      </h1>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">{t('auth.newPasswordHint')}</p>
      {error && <p className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-500">{error}</p>}
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="new-password" className="text-sm font-medium text-[var(--text-primary)]">
            {t('auth.newPassword')}
          </label>
          <div className="relative mt-1">
            <Input
              id="new-password"
              type={visible ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
            <button
              type="button"
              onClick={() => setVisible((current) => !current)}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-[var(--text-muted)]"
              aria-label={visible ? t('auth.hidePassword') : t('auth.showPassword')}
            >
              {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div>
          <label
            htmlFor="confirm-password"
            className="text-sm font-medium text-[var(--text-primary)]"
          >
            {t('auth.confirmPassword')}
          </label>
          <Input
            id="confirm-password"
            type={visible ? 'text' : 'password'}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            className="mt-1"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? t('common.loading') : t('auth.updatePassword')}
        </Button>
      </form>
    </div>
  )
}
