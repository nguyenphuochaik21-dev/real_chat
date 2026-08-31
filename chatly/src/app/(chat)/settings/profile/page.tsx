'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Camera, User, Info } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Tables } from '@/types'
import { useI18n } from '@/lib/i18n'

type Profile = Tables<'profiles'>

export default function ProfilePage() {
  const { t } = useI18n()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const fetchProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()

        if (data) {
          setProfile(data)
          setName(data.display_name || '')
          setBio(data.bio || '')
        }
      }
      setLoading(false)
    }
    fetchProfile()
  }, [supabase])

  const handleSave = async () => {
    if (!profile) return

    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          display_name: name,
          bio: bio,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id)

      if (updateError) throw updateError

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('profile.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full flex-1 items-center justify-center bg-[var(--bg-app)]">
        <div className="border-primary-500 h-8 w-8 animate-spin rounded-full border-3 border-t-transparent" />
      </div>
    )
  }

  const userForAvatar = profile || {
    id: 'unknown',
    display_name: t('common.user'),
    avatar_url: null,
  }

  return (
    <div className="flex h-full flex-1 flex-col bg-[var(--bg-app)]">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-[var(--border-default)] bg-[var(--bg-panel)] p-4">
        <Link href="/settings">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">{t('profile.title')}</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Success message */}
        {success && (
          <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-600 dark:bg-green-900/20 dark:text-green-400">
            {t('profile.saved')}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Avatar section */}
        <div className="mb-8 flex flex-col items-center">
          <div className="relative">
            <Avatar user={userForAvatar} size="xl" />
            <button className="bg-primary-500 hover:bg-primary-600 absolute right-0 bottom-0 flex h-8 w-8 items-center justify-center rounded-full text-white shadow-lg">
              <Camera className="h-4 w-4" />
            </button>
          </div>
          <p className="text-primary-500 mt-3 cursor-pointer text-sm hover:underline">
            {t('profile.changePhoto')}
          </p>
        </div>

        {/* Form */}
        <div className="space-y-6">
          {/* Name */}
          <div className="rounded-xl bg-[var(--bg-panel)] p-4">
            <div className="mb-2 flex items-center gap-2 text-[var(--text-muted)]">
              <User className="h-4 w-4" />
              <span className="text-sm">{t('profile.name')}</span>
            </div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border-0 bg-transparent p-0 text-lg focus:ring-0"
              placeholder={t('profile.namePlaceholder')}
            />
          </div>

          {/* About */}
          <div className="rounded-xl bg-[var(--bg-panel)] p-4">
            <div className="mb-2 flex items-center gap-2 text-[var(--text-muted)]">
              <Info className="h-4 w-4" />
              <span className="text-sm">{t('profile.about')}</span>
            </div>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              className="w-full resize-none border-0 bg-transparent p-0 text-[var(--text-secondary)] focus:outline-none"
              placeholder={t('profile.aboutPlaceholder')}
            />
          </div>

          {/* Phone */}
          <div className="rounded-xl bg-[var(--bg-panel)] p-4">
            <p className="mb-2 text-sm text-[var(--text-muted)]">{t('profile.phone')}</p>
            <p className="text-[var(--text-secondary)]">{profile?.phone || t('profile.notSet')}</p>
          </div>
        </div>
      </div>

      {/* Save button */}
      <div className="border-t border-[var(--border-default)] bg-[var(--bg-panel)] p-4">
        <Button onClick={handleSave} className="w-full" disabled={saving}>
          {saving ? t('profile.saving') : t('profile.save')}
        </Button>
      </div>
    </div>
  )
}
