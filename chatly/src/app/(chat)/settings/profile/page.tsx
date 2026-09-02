'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Camera, CalendarDays, Info, LinkIcon, Phone, User } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n'
import { getMyProfile, updateMyProfile, type MyProfileDetails } from '@/lib/actions/profile'

export default function ProfilePage() {
  const { t } = useI18n()
  const [profile, setProfile] = useState<MyProfileDetails | null>(null)
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [phone, setPhone] = useState('')
  const [phoneVisibility, setPhoneVisibility] = useState<'public' | 'private'>('private')
  const [birthDate, setBirthDate] = useState('')
  const [birthDateVisibility, setBirthDateVisibility] = useState<'public' | 'private'>('private')
  const [socialLinks, setSocialLinks] = useState('')
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const data = await getMyProfile()
        if (data) {
          setProfile(data)
          setName(data.display_name || '')
          setBio(data.bio || '')
          setPhone(data.phone || '')
          setPhoneVisibility(data.phone_visibility)
          setBirthDate(data.birth_date || '')
          setBirthDateVisibility(data.birth_date_visibility)
          setSocialLinks(data.social_links.join('\n'))
        }
      } catch (profileError) {
        setError(profileError instanceof Error ? profileError.message : t('common.unknownError'))
      } finally {
        setLoading(false)
      }
    }
    void fetchProfile()
  }, [supabase, t])

  const handleSave = async () => {
    if (!profile) return

    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      await updateMyProfile({
        displayName: name,
        bio,
        phone,
        phoneVisibility,
        birthDate,
        birthDateVisibility,
        socialLinks: socialLinks
          .split('\n')
          .map((link) => link.trim())
          .filter(Boolean),
      })

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('profile.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !profile) return
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setError(t('profile.avatarInvalid'))
      return
    }

    setUploadingAvatar(true)
    setError(null)
    let uploadedPath: string | null = null
    let profileUpdated = false
    try {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${profile.id}/avatar-${Date.now()}.${extension}`
      const { error: uploadError } = await supabase.storage
        .from('profile-avatars')
        .upload(path, file, { upsert: false, cacheControl: '31536000' })
      if (uploadError) throw uploadError
      uploadedPath = path

      const { data } = supabase.storage.from('profile-avatars').getPublicUrl(path)
      const previousAvatarUrl = profile.avatar_url
      await updateMyProfile({
        displayName: name,
        bio,
        phone,
        phoneVisibility,
        birthDate,
        birthDateVisibility,
        socialLinks: socialLinks
          .split('\n')
          .map((link) => link.trim())
          .filter(Boolean),
        avatarUrl: data.publicUrl,
      })
      profileUpdated = true
      setProfile((current) => (current ? { ...current, avatar_url: data.publicUrl } : current))
      const marker = '/storage/v1/object/public/profile-avatars/'
      const markerPosition = previousAvatarUrl?.indexOf(marker) ?? -1
      if (previousAvatarUrl && markerPosition >= 0) {
        const previousPath = previousAvatarUrl.slice(markerPosition + marker.length).split('?')[0]
        if (previousPath.startsWith(`${profile.id}/`) && previousPath !== path) {
          await supabase.storage.from('profile-avatars').remove([previousPath])
        }
      }
    } catch (uploadError) {
      if (uploadedPath && !profileUpdated) {
        await supabase.storage.from('profile-avatars').remove([uploadedPath])
      }
      setError(uploadError instanceof Error ? uploadError.message : t('profile.saveFailed'))
    } finally {
      setUploadingAvatar(false)
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
          <Avatar user={userForAvatar} size="xl" />
          <label className="mt-3">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleAvatarUpload}
              disabled={uploadingAvatar}
            />
            <span className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-hover)]">
              <Camera className="h-4 w-4" />
              {uploadingAvatar ? t('profile.uploadingAvatar') : t('profile.changeAvatar')}
            </span>
          </label>
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
              maxLength={100}
              className="border-0 bg-transparent p-0 text-lg focus:ring-0"
              placeholder={t('profile.namePlaceholder')}
            />
          </div>

          <div className="rounded-xl bg-[var(--bg-panel)] p-4">
            <div className="mb-2 flex items-center gap-2 text-[var(--text-muted)]">
              <Phone className="h-4 w-4" />
              <span className="text-sm">{t('profile.phone')}</span>
            </div>
            <Input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              maxLength={30}
              placeholder={t('profile.phonePlaceholder')}
            />
            <VisibilitySelect value={phoneVisibility} onChange={setPhoneVisibility} t={t} />
          </div>

          <div className="rounded-xl bg-[var(--bg-panel)] p-4">
            <div className="mb-2 flex items-center gap-2 text-[var(--text-muted)]">
              <CalendarDays className="h-4 w-4" />
              <span className="text-sm">{t('profile.birthDate')}</span>
            </div>
            <Input
              type="date"
              value={birthDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(event) => setBirthDate(event.target.value)}
            />
            <VisibilitySelect value={birthDateVisibility} onChange={setBirthDateVisibility} t={t} />
          </div>

          <div className="rounded-xl bg-[var(--bg-panel)] p-4">
            <div className="mb-2 flex items-center gap-2 text-[var(--text-muted)]">
              <LinkIcon className="h-4 w-4" />
              <span className="text-sm">{t('profile.socialLinks')}</span>
            </div>
            <textarea
              value={socialLinks}
              onChange={(event) => setSocialLinks(event.target.value)}
              rows={4}
              placeholder={t('profile.socialLinksHint')}
              className="w-full resize-none rounded-lg border border-[var(--border-default)] bg-transparent px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none"
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
              maxLength={500}
              rows={3}
              className="w-full resize-none border-0 bg-transparent p-0 text-[var(--text-secondary)] focus:outline-none"
              placeholder={t('profile.aboutPlaceholder')}
            />
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

function VisibilitySelect({
  value,
  onChange,
  t,
}: {
  value: 'public' | 'private'
  onChange: (value: 'public' | 'private') => void
  t: (key: string) => string
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as 'public' | 'private')}
      className="mt-3 w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-panel)] px-3 py-2 text-sm text-[var(--text-primary)]"
    >
      <option value="private">{t('profile.private')}</option>
      <option value="public">{t('profile.public')}</option>
    </select>
  )
}
