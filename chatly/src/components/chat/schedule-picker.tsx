'use client'

import { useState } from 'react'
import { Clock, Calendar, Send, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface SchedulePickerProps {
  isOpen: boolean
  onClose: () => void
  onSchedule: (scheduledAt: Date) => void
  initialContent?: string
}

interface QuickOption {
  label: string
  getDate: () => Date
}

const quickOptions: QuickOption[] = [
  {
    label: 'Tomorrow 9:00 AM',
    getDate: () => {
      const d = new Date()
      d.setDate(d.getDate() + 1)
      d.setHours(9, 0, 0, 0)
      return d
    },
  },
  {
    label: 'Tomorrow 6:00 PM',
    getDate: () => {
      const d = new Date()
      d.setDate(d.getDate() + 1)
      d.setHours(18, 0, 0, 0)
      return d
    },
  },
  {
    label: 'Next Monday 9:00 AM',
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
    label: 'In 1 hour',
    getDate: () => {
      const d = new Date()
      d.setHours(d.getHours() + 1)
      return d
    },
  },
  {
    label: 'In 3 hours',
    getDate: () => {
      const d = new Date()
      d.setHours(d.getHours() + 3)
      return d
    },
  },
]

function formatDateTime(date: Date): string {
  return date.toLocaleString([], {
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

export function SchedulePicker({ isOpen, onClose, onSchedule, initialContent }: SchedulePickerProps) {
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
      <div
        className="fixed inset-0 z-40 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-[var(--bg-panel)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-default)] p-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary-500" />
            <h2 className="font-semibold text-[var(--text-primary)]">Schedule Message</h2>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Quick options */}
          <div className="mb-4">
            <p className="mb-2 text-sm font-medium text-[var(--text-secondary)]">Quick options</p>
            <div className="grid grid-cols-2 gap-2">
              {quickOptions.map((option) => (
                <button
                  key={option.label}
                  onClick={() => handleQuickOption(option)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border border-[var(--border-default)] p-3 text-left transition-colors',
                    'hover:bg-[var(--bg-hover)]'
                  )}
                >
                  <Calendar className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                  <span className="text-xs text-[var(--text-primary)]">{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="mb-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-[var(--border-default)]" />
            <span className="text-xs text-[var(--text-muted)]">or</span>
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
                {showCustomPicker ? 'Custom date & time' : formatDateTime(selectedDate)}
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
                    ? `Will be sent: ${formatDateTime(selectedDate)}`
                    : 'Please select a future date and time'}
                </p>
                <Button
                  onClick={handleCustomSchedule}
                  disabled={selectedDate <= new Date()}
                  className="mt-3 w-full"
                  size="sm"
                >
                  <Send className="mr-2 h-4 w-4" />
                  Schedule
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-[var(--border-default)] p-4">
          <p className="text-xs text-[var(--text-muted)]">
            The message will be sent automatically at the scheduled time.
          </p>
        </div>
      </div>
    </>
  )
}
