import Image from 'next/image'
import { cn } from '@/lib/utils'
import { resolvePresence, type PresenceStatus as ResolvedStatus } from '@/lib/presence'

type UserStatus = 'online' | 'offline' | 'away' | 'busy' | null

interface BaseUser {
  id: string
  display_name: string
  avatar_url: string | null
}

interface UserWithStatus extends BaseUser {
  status: UserStatus
}

interface UserWithoutStatus extends BaseUser {
  status?: never
  last_seen?: string | null
}

type AvatarUser = UserWithStatus | UserWithoutStatus

interface AvatarProps {
  user: AvatarUser
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  showStatus?: boolean
  /** Override the user's status - useful for realtime presence */
  statusOverride?: UserStatus
  /** When statusOverride is used, supply the last_seen so we can still detect stale "online" */
  lastSeen?: string | null
  className?: string
}

const sizeClasses = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-lg',
  xl: 'w-24 h-24 text-3xl',
  '2xl': 'w-32 h-32 text-4xl',
}

const sizePixels = {
  sm: 32,
  md: 40,
  lg: 56,
  xl: 96,
  '2xl': 128,
}

const statusSizeClasses = {
  sm: 'w-2.5 h-2.5 border',
  md: 'w-3 h-3 border-2',
  lg: 'w-4 h-4 border-2',
  xl: 'w-6 h-6 border-2',
  '2xl': 'w-8 h-8 border-2',
}

const statusColors: Record<Exclude<UserStatus, null>, string> = {
  online: 'bg-[var(--color-online)]',
  offline: 'bg-[var(--color-offline)]',
  away: 'bg-[var(--color-away)]',
  busy: 'bg-[var(--color-busy)]',
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function getColorFromName(name: string): string {
  const colors = [
    'bg-primary-500',
    'bg-purple-500',
    'bg-pink-500',
    'bg-indigo-500',
    'bg-blue-500',
    'bg-cyan-500',
    'bg-teal-500',
    'bg-green-500',
    'bg-amber-500',
    'bg-orange-500',
  ]
  const index = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return colors[index % colors.length]
}

export function Avatar({
  user,
  size = 'md',
  showStatus = false,
  statusOverride,
  lastSeen,
  className,
}: AvatarProps) {
  // Safety check - if user is null/undefined, render a placeholder
  if (!user) {
    return (
      <div className={cn('relative inline-block', className)}>
        <div
          className={cn(
            'flex items-center justify-center rounded-full bg-[var(--bg-hover)] font-medium text-[var(--text-muted)]',
            sizeClasses[size]
          )}
        >
          ?
        </div>
      </div>
    )
  }

  const hasStatus = 'status' in user && user.status !== undefined
  const userLastSeen =
    'last_seen' in user ? ((user as { last_seen?: string | null }).last_seen ?? null) : null
  const effectiveLastSeen = lastSeen ?? userLastSeen
  // Use override if provided, otherwise use user's own status, default to 'offline'
  const rawStatus = statusOverride ?? (hasStatus ? user.status : 'offline') ?? 'offline'
  const resolvedStatus = (rawStatus === null ? 'offline' : rawStatus) as Exclude<
    ResolvedStatus,
    null
  >

  // If status was "online" but last_seen is missing or stale, demote to offline.
  const finalStatus: Exclude<ResolvedStatus, null> =
    resolvedStatus === 'online' && !statusOverride
      ? resolvePresence({ status: resolvedStatus, lastSeen: effectiveLastSeen })
      : resolvedStatus

  return (
    <div className={cn('relative inline-block', className)}>
      {user.avatar_url ? (
        <Image
          src={user.avatar_url}
          alt={user.display_name}
          width={sizePixels[size]}
          height={sizePixels[size]}
          sizes={`${sizePixels[size]}px`}
          loading="lazy"
          className={cn('rounded-full object-cover', sizeClasses[size], 'bg-[var(--bg-hover)]')}
        />
      ) : (
        <div
          className={cn(
            'flex items-center justify-center rounded-full font-medium text-white',
            sizeClasses[size],
            getColorFromName(user.display_name)
          )}
        >
          {getInitials(user.display_name)}
        </div>
      )}
      {showStatus && (
        <span
          className={cn(
            'absolute right-0 bottom-0 rounded-full border-[var(--bg-panel)]',
            statusSizeClasses[size],
            statusColors[finalStatus]
          )}
        />
      )}
    </div>
  )
}
