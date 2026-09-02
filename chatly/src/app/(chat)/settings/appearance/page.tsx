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
      </div>
    </div>
  )
}
