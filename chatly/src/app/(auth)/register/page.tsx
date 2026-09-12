'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, Eye, EyeOff, Sparkles } from 'lucide-react'
import { AuthFeedback } from '@/components/auth/auth-feedback'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { useHydrated } from '@/hooks/use-hydrated'
import { saveAuthNotice } from '@/lib/auth-notice'
import { getAuthErrorMessage } from '@/lib/auth-error'
import { useI18n } from '@/lib/i18n'

export default function RegisterPage() {
  const { t } = useI18n()
  const router = useRouter()
  const hydrated = useHydrated()
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const passwordRequirements = [
    { met: password.length >= 8, text: t('auth.passwordLength') },
    { met: /[A-Z]/.test(password), text: t('auth.passwordUpper') },
    { met: /[a-z]/.test(password), text: t('auth.passwordLower') },
    { met: /[0-9]/.test(password), text: t('auth.passwordNumber') },
  ]

  const allRequirementsMet = passwordRequirements.every((r) => r.met)

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    if (!allRequirementsMet) {
      setError(t('auth.passwordRequirements'))
      setIsLoading(false)
      return
    }

    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          username,
        },
        emailRedirectTo: `${window.location.origin}/callback`,
      },
    })

    if (error) {
      setError(getAuthErrorMessage(error, t))
      setIsLoading(false)
      return
    }

    if (!data.session) {
      saveAuthNotice('check-email')
      router.replace('/login')
      router.refresh()
      return
    }

    saveAuthNotice('account-created')
    router.replace('/chats')
    router.refresh()
  }

  const handleOAuthRegister = async () => {
    setIsLoading(true)
    setError('')

    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/callback`,
      },
    })

    if (error) {
      setError(getAuthErrorMessage(error, t))
      setIsLoading(false)
    }
  }

  return (
    <div>
      <div className="text-primary-500 mb-3 flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="h-4 w-4" />
        {t('auth.joinChatly')}
      </div>

      <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
        {t('auth.registerTitle')}
      </h1>
      <p className="mt-2 leading-6 text-[var(--text-secondary)]">{t('auth.registerSubtitle')}</p>

      {error && <AuthFeedback message={error} />}

      {/* OAuth Buttons */}
      <div className="mt-7 space-y-3">
        <Button
          variant="outline"
          className="h-11 w-full justify-center rounded-xl"
          onClick={handleOAuthRegister}
          disabled={!hydrated || isLoading}
        >
          <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          {t('auth.continueGoogle')}
        </Button>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <Separator className="flex-1" />
        <span className="text-sm text-[var(--text-muted)]">{t('auth.or')}</span>
        <Separator className="flex-1" />
      </div>

      {/* Registration form */}
      <form onSubmit={handleRegister} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="fullName"
            className="block text-sm font-medium text-[var(--text-primary)]"
          >
            {t('auth.fullName')}
          </label>
          <Input
            id="fullName"
            type="text"
            placeholder={t('auth.fullNamePlaceholder')}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            autoComplete="name"
            className="mt-1"
          />
        </div>

        <div>
          <label
            htmlFor="username"
            className="block text-sm font-medium text-[var(--text-primary)]"
          >
            {t('auth.username')}
          </label>
          <Input
            id="username"
            type="text"
            placeholder={t('auth.usernamePlaceholder')}
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            required
            autoComplete="username"
            className="mt-1"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-[var(--text-primary)]">
            {t('auth.email')}
          </label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="mt-1"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-[var(--text-primary)]"
          >
            {t('auth.password')}
          </label>
          <div className="relative mt-1">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              className="absolute top-1/2 right-0 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {/* Password requirements */}
          <div className="mt-2 space-y-1">
            {passwordRequirements.map((req, index) => (
              <div
                key={index}
                className={`flex items-center gap-2 text-xs ${
                  req.met ? 'text-green-600 dark:text-green-400' : 'text-[var(--text-muted)]'
                }`}
              >
                <Check className={`h-3 w-3 ${req.met ? 'opacity-100' : 'opacity-40'}`} />
                {req.text}
              </div>
            ))}
          </div>
        </div>

        <Button
          type="submit"
          className="h-11 w-full rounded-xl"
          disabled={!hydrated || isLoading || !allRequirementsMet}
        >
          {isLoading ? t('auth.creating') : t('auth.createAccount')}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-[var(--text-muted)]">{t('auth.terms')}</p>
      <p className="mt-4 text-center text-sm text-[var(--text-muted)]">
        {t('auth.hasAccount')}{' '}
        <Link href="/login" className="text-primary-500 font-medium hover:underline">
          {t('auth.signIn')}
        </Link>
      </p>
    </div>
  )
}
