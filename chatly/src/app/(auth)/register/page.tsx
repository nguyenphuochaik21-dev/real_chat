'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, MessageSquare, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n'

export default function RegisterPage() {
  const { t } = useI18n()
  const router = useRouter()
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

    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
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
      setError(error.message)
      setIsLoading(false)
      return
    }

    router.push('/chats')
    router.refresh()
  }

  const handleOAuthRegister = async () => {
    setIsLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/callback`,
      },
    })

    if (error) {
      setError(error.message)
      setIsLoading(false)
    }
  }

  return (
    <div>
      <div className="mb-8 flex justify-center lg:hidden">
        <div className="bg-primary-500 flex h-12 w-12 items-center justify-center rounded-xl text-white">
          <MessageSquare className="h-6 w-6" />
        </div>
      </div>

      <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t('auth.registerTitle')}</h2>
      <p className="mt-2 text-[var(--text-secondary)]">
        {t('auth.hasAccount')}{' '}
        <Link href="/login" className="text-primary-500 font-medium hover:underline">
          {t('auth.signIn')}
        </Link>
      </p>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* OAuth Buttons */}
      <div className="mt-6 space-y-3">
        <Button
          variant="outline"
          className="w-full justify-center"
          onClick={handleOAuthRegister}
          disabled={isLoading}
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
            placeholder="John Doe"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
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
            placeholder="johndoe"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            required
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
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute top-1/2 right-3 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
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

        <Button type="submit" className="w-full" disabled={isLoading || !allRequirementsMet}>
          {isLoading ? t('auth.creating') : t('auth.createAccount')}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-[var(--text-muted)]">{t('auth.terms')}</p>
    </div>
  )
}
