'use client'

import { useState } from 'react'
import { Clock, Calendar, Send, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

interface SchedulePickerProps {
  isOpen: boolean
  onClose: () => void
  onSchedule: (scheduledAt: Date) => void
  initialContent?: string
}

interface QuickOption {
  labelKey: string
  getDate: () => Date
}

const quickOptions: QuickOption[] = [
  {
    labelKey: 'schedule.tomorrowMorning',
    getDate: () => {
      const d = new Date()
      d.setDate(d.getDate() + 1)
      d.setHours(9, 0, 0, 0)
      return d
    },
  },
  {
    labelKey: 'schedule.tomorrowEvening',
    getDate: () => {
      const d = new Date()
      d.setDate(d.getDate() + 1)
      d.setHours(18, 0, 0, 0)
      return d
    },
  },
  {
    labelKey: 'schedule.nextMonday',
    getDate: () => {
      const d = new Date()
      const day = d.getDay()
      const daysUntilMonday = day === 0 ? 1 : 8 - day
      d.setDate(d.getDate() + daysUntilMonday)
      d.setHours(9, 0, 0, 0)
      return d
    },
  },
  {
    labelKey: 'schedule.inOneHour',
    getDate: () => {
      const d = new Date()
      d.setHours(d.getHours() + 1)
      return d
    },
  },
  {
    labelKey: 'schedule.inThreeHours',
    getDate: () => {
      const d = new Date()
      d.setHours(d.getHours() + 3)
      return d
    },
  },
]

function formatDateTime(date: Date, dateLocale: string): string {
  return date.toLocaleString(dateLocale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export function SchedulePicker({ isOpen, onClose, onSchedule }: SchedulePickerProps) {
  const { t, dateLocale } = useI18n()
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date()
    d.setHours(d.getHours() + 1)
    d.setMinutes(0, 0, 0)
    return d
  })
  const [showCustomPicker, setShowCustomPicker] = useState(false)

  if (!isOpen) return null

  const handleQuickOption = (option: QuickOption) => {
    const scheduledAt = option.getDate()
    onSchedule(scheduledAt)
  }

  const handleCustomSchedule = () => {
    if (selectedDate > new Date()) {
      onSchedule(selectedDate)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-1rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-[var(--bg-panel)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-default)] p-4">
          <div className="flex items-center gap-2">
            <Clock className="text-primary-500 h-5 w-5" />
            <h2 className="font-semibold text-[var(--text-primary)]">{t('schedule.title')}</h2>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Quick options */}
          <div className="mb-4">
            <p className="mb-2 text-sm font-medium text-[var(--text-secondary)]">
              {t('schedule.quick')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {quickOptions.map((option) => (
                <button
                  key={option.labelKey}
                  onClick={() => handleQuickOption(option)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border border-[var(--border-default)] p-3 text-left transition-colors',
                    'hover:bg-[var(--bg-hover)]'
                  )}
                >
                  <Calendar className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                  <span className="text-xs text-[var(--text-primary)]">{t(option.labelKey)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="mb-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--border-default)]" />
            <span className="text-xs text-[var(--text-muted)]">{t('auth.or')}</span>
            <div className="h-px flex-1 bg-[var(--border-default)]" />
          </div>

          {/* Custom date/time picker */}
          <div>
            <button
              onClick={() => setShowCustomPicker(!showCustomPicker)}
              className={cn(
                'mb-2 flex w-full items-center gap-2 rounded-lg border border-[var(--border-default)] p-3 transition-colors',
                showCustomPicker && 'border-primary-500 bg-[var(--bg-active)]'
              )}
            >
              <Clock className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
              <span className="text-sm text-[var(--text-primary)]">
                {showCustomPicker ? t('schedule.custom') : formatDateTime(selectedDate, dateLocale)}
              </span>
            </button>

            {showCustomPicker && (
              <div className="mt-2 rounded-lg border border-[var(--border-default)] p-4">
                <input
                  type="datetime-local"
                  value={formatDateInput(selectedDate)}
                  onChange={(e) => {
                    const newDate = new Date(e.target.value)
                    if (!isNaN(newDate.getTime())) {
                      setSelectedDate(newDate)
                    }
                  }}
                  min={formatDateInput(new Date())}
                  className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
                />
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  {selectedDate > new Date()
                    ? t('schedule.willSend', { time: formatDateTime(selectedDate, dateLocale) })
                    : t('schedule.future')}
                </p>
                <Button
                  onClick={handleCustomSchedule}
                  disabled={selectedDate <= new Date()}
                  className="mt-3 w-full"
                  size="sm"
                >
                  <Send className="mr-2 h-4 w-4" />
                  {t('schedule.action')}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--border-default)] p-4">
          <p className="text-xs text-[var(--text-muted)]">{t('schedule.hint')}</p>
        </div>
      </div>
    </>
  )
}
