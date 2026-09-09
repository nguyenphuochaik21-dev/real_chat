import { BadgeCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

interface VerifiedBadgeProps {
  label: string
  className?: string
}

export function VerifiedBadge({ label, className }: VerifiedBadgeProps) {
  return (
    <BadgeCheck
      className={cn('h-4 w-4 shrink-0 fill-sky-500 text-white', className)}
      aria-label={label}
      role="img"
    />
  )
}
