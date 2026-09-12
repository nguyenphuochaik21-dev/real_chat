import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AuthFeedbackProps {
  message: string
  tone?: 'error' | 'success' | 'info'
}

const toneStyles = {
  error: 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-300',
  success: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  info: 'border-primary-500/20 bg-primary-500/10 text-primary-700 dark:text-primary-300',
}

const toneIcons = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
}

export function AuthFeedback({ message, tone = 'error' }: AuthFeedbackProps) {
  const Icon = toneIcons[tone]

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      className={cn(
        'mt-5 flex items-start gap-2.5 rounded-xl border p-3 text-sm',
        toneStyles[tone]
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  )
}
