import Image from 'next/image'
import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { PublicProfile } from '@/types'

interface GroupAvatarProps {
  id: string
  name: string
  avatarUrl?: string | null
  members: PublicProfile[]
  size?: 'md' | 'lg'
  className?: string
}

const sizeClasses = {
  md: 'h-10 w-10',
  lg: 'h-14 w-14',
}

const colors = ['bg-violet-500', 'bg-blue-500', 'bg-cyan-500', 'bg-emerald-500']

export function GroupAvatar({
  id,
  name,
  avatarUrl,
  members,
  size = 'md',
  className,
}: GroupAvatarProps) {
  if (avatarUrl || members.length === 0) {
    return (
      <Avatar
        user={{ id, display_name: name, avatar_url: avatarUrl ?? null }}
        size={size}
        showStatus={false}
        className={className}
      />
    )
  }

  const visibleMembers = members.slice(0, 4)
  return (
    <div
      className={cn(
        'grid shrink-0 grid-cols-2 overflow-hidden rounded-full border border-[var(--bg-panel)] bg-[var(--bg-hover)]',
        sizeClasses[size],
        className
      )}
      aria-label={name}
    >
      {visibleMembers.map((member, index) => (
        <div
          key={member.id}
          className={cn(
            'relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden border-[var(--bg-panel)] text-[9px] font-semibold text-white',
            index % 2 === 0 && 'border-r',
            index < 2 && visibleMembers.length > 2 && 'border-b',
            colors[index % colors.length],
            visibleMembers.length === 1 && 'col-span-2 row-span-2'
          )}
        >
          {member.avatar_url ? (
            <Image
              src={member.avatar_url}
              alt={member.display_name}
              fill
              sizes={size === 'lg' ? '28px' : '20px'}
              className="object-cover"
            />
          ) : (
            member.display_name.trim().charAt(0).toUpperCase() || '?'
          )}
        </div>
      ))}
    </div>
  )
}
