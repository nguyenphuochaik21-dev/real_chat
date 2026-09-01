'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Ban,
  CheckCircle2,
  KeyRound,
  MessageSquare,
  Phone,
  Search,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { updateAdminUser, type AdminDashboardData, type AdminUser } from '@/lib/actions/admin'
import { useI18n } from '@/lib/i18n'

interface AdminDashboardProps {
  data: AdminDashboardData
}

export function AdminDashboard({ data }: AdminDashboardProps) {
  const { dateLocale, t } = useI18n()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const users = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    if (!query) return data.users
    return data.users.filter((user) =>
      `${user.display_name} ${user.username} ${user.email ?? ''}`
        .toLocaleLowerCase()
        .includes(query)
    )
  }, [data.users, search])

  const updateUser = async (
    user: AdminUser,
    updates: Partial<Pick<AdminUser, 'role' | 'is_suspended'>>
  ) => {
    setBusyId(user.id)
    setError(null)
    try {
      await updateAdminUser(
        user.id,
        updates.role ?? user.role,
        updates.is_suspended ?? user.is_suspended
      )
      router.refresh()
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : t('common.unknownError'))
    } finally {
      setBusyId(null)
    }
  }

  const statCards = [
    { label: t('admin.users'), value: data.stats.users, icon: Users },
    { label: t('admin.conversations'), value: data.stats.conversations, icon: MessageSquare },
    { label: t('admin.messages'), value: data.stats.messages, icon: MessageSquare },
    { label: t('admin.friendships'), value: data.stats.friendships, icon: UserRoundCheck },
    { label: t('admin.calls'), value: data.stats.calls, icon: Phone },
    { label: t('admin.suspended'), value: data.stats.suspendedUsers, icon: Ban },
  ]

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-[var(--bg-app)]">
      <header className="border-b border-[var(--border-default)] bg-[var(--bg-panel)] p-4">
        <div className="flex items-center gap-3">
          <ShieldCheck className="text-primary-500 h-6 w-6" />
          <div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">{t('admin.title')}</h1>
            <p className="text-xs text-[var(--text-muted)]">{t('admin.subtitle')}</p>
          </div>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            {statCards.map((card) => (
              <div key={card.label} className="rounded-xl bg-[var(--bg-panel)] p-4 shadow-sm">
                <card.icon className="text-primary-500 mb-3 h-5 w-5" />
                <p className="text-2xl font-bold text-[var(--text-primary)]">{card.value}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{card.label}</p>
              </div>
            ))}
          </section>

          <section className="rounded-xl bg-[var(--bg-panel)] shadow-sm">
            <div className="border-b border-[var(--border-default)] p-4">
              <div className="relative max-w-md">
                <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <Input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('admin.search')}
                  className="pl-10"
                />
              </div>
              {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
            </div>

            <div className="divide-y divide-[var(--border-default)]">
              {users.map((user) => (
                <div key={user.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
                  <Link
                    href={`/profile/${user.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <Avatar user={user} size="md" showStatus />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium text-[var(--text-primary)]">
                          {user.display_name}
                        </p>
                        {user.role === 'admin' && (
                          <Badge variant="primary" size="sm">
                            Admin
                          </Badge>
                        )}
                        {user.is_suspended && (
                          <Badge className="bg-red-500/10 text-red-500" size="sm">
                            {t('admin.suspended')}
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-xs text-[var(--text-muted)]">
                        {user.email || `@${user.username}`} · {user.friend_count}{' '}
                        {t('admin.friends')} ·{' '}
                        {user.created_at
                          ? new Date(user.created_at).toLocaleDateString(dateLocale)
                          : '—'}
                      </p>
                    </div>
                  </Link>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === user.id || user.id === data.currentUserId}
                      onClick={() =>
                        void updateUser(user, { role: user.role === 'admin' ? 'user' : 'admin' })
                      }
                    >
                      <KeyRound className="h-4 w-4" />
                      {user.role === 'admin' ? t('admin.makeUser') : t('admin.makeAdmin')}
                    </Button>
                    <Button
                      variant={user.is_suspended ? 'outline' : 'destructive'}
                      size="sm"
                      disabled={busyId === user.id || user.id === data.currentUserId}
                      onClick={() => void updateUser(user, { is_suspended: !user.is_suspended })}
                    >
                      {user.is_suspended ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <Ban className="h-4 w-4" />
                      )}
                      {user.is_suspended ? t('admin.restore') : t('admin.suspend')}
                    </Button>
                  </div>
                </div>
              ))}
              {!users.length && (
                <p className="p-8 text-center text-sm text-[var(--text-muted)]">
                  {t('admin.noUsers')}
                </p>
              )}
            </div>
          </section>
        </main>
      </ScrollArea>
    </div>
  )
}
