'use client'

import {
  Phone,
  Video,
  BellOff,
  Search,
  X,
  Mail,
  Phone as PhoneIcon,
  Image,
  FileText,
  Film,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import type { MockUser } from '@/lib/mock/types'

interface InfoPanelProps {
  user: MockUser
  onClose: () => void
}

export function InfoPanel({ user, onClose }: InfoPanelProps) {
  return (
    <div className="flex h-full w-80 flex-col border-l border-[var(--border-default)] bg-[var(--bg-panel)]">
      {/* Header with gradient */}
      <div className="from-primary-500 relative bg-gradient-to-b to-purple-500 p-6 pt-12">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rounded-full bg-white/20 p-1.5 text-white transition-colors hover:bg-white/30"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex flex-col items-center text-center">
          <Avatar user={user} size="xl" showStatus className="mb-4 border-4 border-white/30" />
          <h2 className="text-xl font-semibold text-white">{user.display_name}</h2>
          <p className="mt-1 text-sm text-white/80">
            {user.status === 'online' ? 'Online' : user.status}
          </p>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4">
          {/* Action buttons */}
          <div className="mb-6 grid grid-cols-4 gap-2">
            <button className="flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors hover:bg-[var(--bg-hover)]">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-hover)]">
                <Phone className="h-5 w-5 text-[var(--text-primary)]" />
              </div>
              <span className="text-xs text-[var(--text-secondary)]">Audio</span>
            </button>

            <button className="flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors hover:bg-[var(--bg-hover)]">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-hover)]">
                <Video className="h-5 w-5 text-[var(--text-primary)]" />
              </div>
              <span className="text-xs text-[var(--text-secondary)]">Video</span>
            </button>

            <button className="flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors hover:bg-[var(--bg-hover)]">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-hover)]">
                <Search className="h-5 w-5 text-[var(--text-primary)]" />
              </div>
              <span className="text-xs text-[var(--text-secondary)]">Search</span>
            </button>

            <button className="flex flex-col items-center gap-1.5 rounded-xl p-3 transition-colors hover:bg-[var(--bg-hover)]">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-hover)]">
                <BellOff className="h-5 w-5 text-[var(--text-primary)]" />
              </div>
              <span className="text-xs text-[var(--text-secondary)]">Muted</span>
            </button>
          </div>

          <Separator />

          {/* About section */}
          <div className="py-4">
            <h3 className="mb-3 text-sm font-medium text-[var(--text-muted)]">About</h3>
            <p className="text-sm text-[var(--text-secondary)]">{user.bio || 'No bio available'}</p>
          </div>

          <Separator />

          {/* Contact info */}
          <div className="py-4">
            <div className="space-y-4">
              {user.phone && (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-hover)]">
                    <PhoneIcon className="h-4 w-4 text-[var(--text-secondary)]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{user.phone}</p>
                    <p className="text-xs text-[var(--text-muted)]">Mobile</p>
                  </div>
                </div>
              )}

              {user.email && (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--bg-hover)]">
                    <Mail className="h-4 w-4 text-[var(--text-secondary)]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{user.email}</p>
                    <p className="text-xs text-[var(--text-muted)]">Email</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Media section */}
          <div className="py-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-[var(--text-muted)]">
                Media, Links and Docs
              </h3>
              <button className="text-primary-500 text-xs hover:underline">3</button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {/* Placeholder media items */}
              {[
                { icon: Image, color: 'bg-emerald-500' },
                { icon: Film, color: 'bg-blue-500' },
                { icon: FileText, color: 'bg-amber-500' },
                { icon: Image, color: 'bg-purple-500' },
                { icon: Image, color: 'bg-pink-500' },
                { icon: Image, color: 'bg-indigo-500' },
              ].map((item, i) => (
                <button
                  key={i}
                  className={cn(
                    'flex aspect-square items-center justify-center rounded-lg text-white',
                    item.color
                  )}
                >
                  <item.icon className="h-6 w-6" />
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Groups in common */}
          <div className="py-4">
            <h3 className="mb-3 text-sm font-medium text-[var(--text-muted)]">Groups in common</h3>
            <div className="space-y-3">
              {['Work Team', 'Design Community', 'Weekend Warriors'].map((group) => (
                <div
                  key={group}
                  className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-[var(--bg-hover)]"
                >
                  <div className="bg-primary-500 flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium text-white">
                    {group.slice(0, 1)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{group}</p>
                    <p className="text-xs text-[var(--text-muted)]">5 members</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
