import { cn } from '@/lib/utils'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'primary' | 'secondary' | 'outline'
  size?: 'sm' | 'md'
  className?: string
}

export function Badge({ children, variant = 'default', size = 'md', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-full font-medium',
        {
          'bg-primary-500 text-white': variant === 'primary',
          'bg-[var(--bg-hover)] text-[var(--text-secondary)]': variant === 'default',
          'text-primary-600 bg-[var(--bg-active)]': variant === 'secondary',
          'border border-[var(--border-default)] text-[var(--text-secondary)]':
            variant === 'outline',
        },
        {
          'px-2 py-0.5 text-xs': size === 'sm',
          'px-3 py-1 text-sm': size === 'md',
        },
        className
      )}
    >
      {children}
    </span>
  )
}
