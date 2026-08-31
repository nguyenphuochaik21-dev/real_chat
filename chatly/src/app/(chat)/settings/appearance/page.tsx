'use client'

import { useTheme } from 'next-themes'
import { ArrowLeft, Moon, Sun, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n'

const themes = [
  { id: 'light', nameKey: 'appearance.light', icon: Sun },
  { id: 'dark', nameKey: 'appearance.dark', icon: Moon },
  { id: 'system', nameKey: 'appearance.system', icon: Monitor },
]

const accentColors = [
  { id: 'indigo', name: 'Indigo', color: 'bg-indigo-500' },
  { id: 'blue', name: 'Blue', color: 'bg-blue-500' },
  { id: 'green', name: 'Green', color: 'bg-green-500' },
  { id: 'purple', name: 'Purple', color: 'bg-purple-500' },
  { id: 'pink', name: 'Pink', color: 'bg-pink-500' },
  { id: 'teal', name: 'Teal', color: 'bg-teal-500' },
]

export default function AppearancePage() {
  const { t } = useI18n()
  const { theme, setTheme } = useTheme()

  return (
    <div className="flex h-full flex-1 flex-col bg-[var(--bg-app)]">
      {/* Header */}
      <div className="flex items-center gap-4 border-b border-[var(--border-default)] bg-[var(--bg-panel)] p-4">
        <Link href="/settings">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          {t('appearance.title')}
        </h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Theme selection */}
        <div className="mb-8">
          <h2 className="mb-4 text-sm font-medium text-[var(--text-muted)]">
            {t('appearance.theme')}
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {themes.map((themeOption) => (
              <button
                key={themeOption.id}
                onClick={() => setTheme(themeOption.id)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-xl p-4 transition-all',
                  theme === themeOption.id
                    ? 'ring-primary-500 bg-[var(--bg-active)] ring-2'
                    : 'bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)]'
                )}
              >
                <div
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-full',
                    themeOption.id === 'light' && 'bg-yellow-100 text-yellow-600',
                    themeOption.id === 'dark' && 'bg-slate-800 text-slate-200',
                    themeOption.id === 'system' &&
                      'bg-gradient-to-br from-yellow-100 to-slate-800 text-white'
                  )}
                >
                  <themeOption.icon className="h-6 w-6" />
                </div>
                <span
                  className={cn(
                    'text-sm font-medium',
                    theme === themeOption.id ? 'text-primary-500' : 'text-[var(--text-secondary)]'
                  )}
                >
                  {t(themeOption.nameKey)}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Accent color */}
        <div className="mb-8">
          <h2 className="mb-4 text-sm font-medium text-[var(--text-muted)]">
            {t('appearance.accent')}
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {accentColors.map((c) => (
              <button
                key={c.id}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-xl p-4 transition-all',
                  c.id === 'indigo'
                    ? 'ring-primary-500 bg-[var(--bg-active)] ring-2'
                    : 'bg-[var(--bg-panel)] hover:bg-[var(--bg-hover)]'
                )}
              >
                <div
                  className={cn(
                    'h-10 w-10 rounded-full',
                    c.color,
                    c.id === 'indigo' && 'ring-2 ring-[var(--bg-app)] ring-offset-2'
                  )}
                />
                <span
                  className={cn(
                    'text-sm font-medium',
                    c.id === 'indigo' ? 'text-primary-500' : 'text-[var(--text-secondary)]'
                  )}
                >
                  {c.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Chat wallpaper */}
        <div>
          <h2 className="mb-4 text-sm font-medium text-[var(--text-muted)]">
            {t('appearance.wallpaper')}
          </h2>
          <div className="grid grid-cols-4 gap-3">
            {[
              'bg-gradient-to-br from-indigo-500 to-purple-500',
              'bg-gradient-to-br from-slate-900 to-slate-700',
              'bg-[#1a1a2e]',
              'bg-gradient-to-br from-emerald-500 to-teal-500',
              'bg-gradient-to-br from-amber-500 to-orange-500',
              'bg-[#0f0f23]',
              'bg-[#1e3a5f]',
              'bg-[#2d1b3d]',
            ].map((wallpaper, i) => (
              <button
                key={i}
                className={cn(
                  'aspect-video rounded-lg transition-all hover:scale-105',
                  wallpaper,
                  i === 0 && 'ring-primary-500 ring-2 ring-offset-2'
                )}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
