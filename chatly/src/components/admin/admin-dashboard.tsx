'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Ban,
  CheckCircle2,
  KeyRound,
  LifeBuoy,
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
import { VerifiedBadge } from '@/components/ui/verified-badge'
import {
  getAdminDashboard,
  getAdminSupportRequest,
  getAdminUsersPage,
  getAdminSupportRequests,
  setAdminUserVerified,
  updateAdminUser,
  updateSupportRequest,
  type AdminDashboardData,
  type AdminUser,
} from '@/lib/actions/admin'
import { useI18n } from '@/lib/i18n'
import { queueSupportPushNotification } from '@/lib/push'
import { createClient } from '@/lib/supabase/client'
import { useNotificationStore } from '@/stores/notification-store'

interface AdminDashboardProps {
  currentUserId: string
}

const EMPTY_STATS: AdminDashboardData['stats'] = {
  users: 0,
  suspendedUsers: 0,
  conversations: 0,
  messages: 0,
  friendships: 0,
  calls: 0,
}

export function AdminDashboard({ currentUserId }: AdminDashboardProps) {
  const { dateLocale, t } = useI18n()
  const [supabase] = useState(() => createClient())
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [totalUsers, setTotalUsers] = useState(0)
  const [stats, setStats] = useState(EMPTY_STATS)
  const [supportRequests, setSupportRequests] = useState<AdminDashboardData['supportRequests']>([])
  const [totalSupportRequests, setTotalSupportRequests] = useState(0)
  const [supportResponses, setSupportResponses] = useState<Record<string, string>>({})
  const [loadingDashboard, setLoadingDashboard] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [loadingSupport, setLoadingSupport] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const firstSearchEffectRef = useRef(true)
  const searchRequestRef = useRef(0)
  const supportRequestIdsRef = useRef(new Set<string>())

  useEffect(() => {
    let active = true
    void getAdminDashboard()
      .then((dashboard) => {
        if (!active) return
        setUsers(dashboard.users)
        setTotalUsers(dashboard.totalUsers)
        setStats(dashboard.stats)
        setSupportRequests(dashboard.supportRequests)
        supportRequestIdsRef.current = new Set(
          dashboard.supportRequests.map((request) => request.id)
        )
        setTotalSupportRequests(dashboard.totalSupportRequests)
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : t('common.unknownError'))
        }
      })
      .finally(() => {
        if (active) setLoadingDashboard(false)
      })

    return () => {
      active = false
    }
  }, [t])

  useEffect(() => {
    let active = true
    const addNotification = useNotificationStore.getState().addNotification
    const refreshRequest = async (requestId: string, notify: boolean) => {
      try {
        const request = await getAdminSupportRequest(requestId)
        if (!active) return
        const alreadyKnown = supportRequestIdsRef.current.has(request.id)
        supportRequestIdsRef.current.add(request.id)
        setSupportRequests((current) => {
          const exists = current.some((item) => item.id === request.id)
          const next = exists
            ? current.map((item) => (item.id === request.id ? request : item))
            : [request, ...current]
          return next.slice(0, 100)
        })
        if (notify && !alreadyKnown) {
          setTotalSupportRequests((current) => current + 1)
          addNotification({
            type: 'system',
            title: t('admin.newSupportRequest'),
            body: `${request.user?.display_name ?? t('common.user')}: ${request.content.slice(0, 100)}`,
          })
        }
      } catch {
        // The next dashboard refresh will reconcile transient realtime fetch failures.
      }
    }

    const channel = supabase
      .channel(`admin-support:${currentUserId}:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_requests' },
        (payload) => void refreshRequest(String(payload.new.id), true)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'support_requests' },
        (payload) => void refreshRequest(String(payload.new.id), false)
      )
      .subscribe()

    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [currentUserId, supabase, t])

  useEffect(() => {
    if (firstSearchEffectRef.current) {
      firstSearchEffectRef.current = false
      return
    }

    const requestId = ++searchRequestRef.current
    const timerId = window.setTimeout(async () => {
      setLoadingUsers(true)
      setError(null)
      try {
        const result = await getAdminUsersPage(search.trim(), 0, 50)
        if (requestId !== searchRequestRef.current) return
        setUsers(result.users)
        setTotalUsers(result.totalUsers)
      } catch (searchError) {
        if (requestId === searchRequestRef.current) {
          setError(searchError instanceof Error ? searchError.message : t('common.unknownError'))
        }
      } finally {
        if (requestId === searchRequestRef.current) setLoadingUsers(false)
      }
    }, 300)

    return () => window.clearTimeout(timerId)
  }, [search, t])

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
      setUsers((current) =>
        current.map((managedUser) =>
          managedUser.id === user.id ? { ...managedUser, ...updates } : managedUser
        )
      )
      if (updates.is_suspended !== undefined && updates.is_suspended !== user.is_suspended) {
        setStats((current) => ({
          ...current,
          suspendedUsers: Math.max(0, current.suspendedUsers + (updates.is_suspended ? 1 : -1)),
        }))
      }
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : t('common.unknownError'))
    } finally {
      setBusyId(null)
    }
  }

  const loadMore = async () => {
    if (loadingUsers || users.length >= totalUsers) return
    const requestId = ++searchRequestRef.current
    setLoadingUsers(true)
    setError(null)
    try {
      const result = await getAdminUsersPage(search.trim(), users.length, 50)
      if (requestId !== searchRequestRef.current) return
      setUsers((current) => {
        const existing = new Set(current.map((user) => user.id))
        return [...current, ...result.users.filter((user) => !existing.has(user.id))]
      })
      setTotalUsers(result.totalUsers)
    } catch (loadError) {
      if (requestId === searchRequestRef.current) {
        setError(loadError instanceof Error ? loadError.message : t('common.unknownError'))
      }
    } finally {
      if (requestId === searchRequestRef.current) setLoadingUsers(false)
    }
  }

  const toggleVerification = async (user: AdminUser) => {
    setBusyId(user.id)
    setError(null)
    try {
      await setAdminUserVerified(user.id, !user.is_verified)
      setUsers((current) =>
        current.map((managedUser) =>
          managedUser.id === user.id
            ? { ...managedUser, is_verified: user.role === 'admin' || !user.is_verified }
            : managedUser
        )
      )
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : t('common.unknownError'))
    } finally {
      setBusyId(null)
    }
  }

  const resolveSupport = async (requestId: string, status: 'open' | 'in_progress' | 'resolved') => {
    setBusyId(requestId)
    setError(null)
    try {
      const response =
        supportResponses[requestId] ??
        supportRequests.find((request) => request.id === requestId)?.admin_response ??
        ''
      await updateSupportRequest(requestId, status, response)
      queueSupportPushNotification(requestId, 'updated')
      setSupportRequests((current) =>
        current.map((request) =>
          request.id === requestId
            ? { ...request, status, admin_response: response || null }
            : request
        )
      )
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : t('common.unknownError'))
    } finally {
      setBusyId(null)
    }
  }

  const loadMoreSupport = async () => {
    if (loadingSupport || supportRequests.length >= totalSupportRequests) return
    setLoadingSupport(true)
    setError(null)
    try {
      const page = await getAdminSupportRequests(supportRequests.length, 30)
      page.requests.forEach((request) => supportRequestIdsRef.current.add(request.id))
      setSupportRequests((current) => {
        const existing = new Set(current.map((request) => request.id))
        return [...current, ...page.requests.filter((request) => !existing.has(request.id))]
      })
      if (page.total !== null) setTotalSupportRequests(page.total)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('common.unknownError'))
    } finally {
      setLoadingSupport(false)
    }
  }

  const statCards = [
    { label: t('admin.users'), value: stats.users, icon: Users },
    { label: t('admin.conversations'), value: stats.conversations, icon: MessageSquare },
    { label: t('admin.messages'), value: stats.messages, icon: MessageSquare },
    { label: t('admin.friendships'), value: stats.friendships, icon: UserRoundCheck },
    { label: t('admin.calls'), value: stats.calls, icon: Phone },
    { label: t('admin.suspended'), value: stats.suspendedUsers, icon: Ban },
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
              <div
                key={card.label}
                className={`rounded-xl bg-[var(--bg-panel)] p-4 shadow-sm ${
                  loadingDashboard ? 'animate-pulse' : ''
                }`}
              >
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
                <div
                  key={user.id}
                  className="list-render-row flex flex-col gap-3 p-4 lg:flex-row lg:items-center"
                >
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
                        {user.is_verified && <VerifiedBadge label={t('verified.label')} />}
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
                      disabled={busyId === user.id || user.role === 'admin'}
                      onClick={() => void toggleVerification(user)}
                    >
                      <VerifiedBadge label={t('verified.label')} />
                      {user.is_verified ? t('admin.unverify') : t('admin.verify')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === user.id || user.id === currentUserId}
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
                      disabled={busyId === user.id || user.id === currentUserId}
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
                  {loadingDashboard ? t('common.loading') : t('admin.noUsers')}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-[var(--border-default)] p-4">
              <p className="text-xs text-[var(--text-muted)]">
                {t('admin.showingUsers', { shown: users.length, total: totalUsers })}
              </p>
              {users.length < totalUsers && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingUsers}
                  onClick={() => void loadMore()}
                >
                  {loadingUsers ? t('common.loading') : t('admin.loadMore')}
                </Button>
              )}
            </div>
          </section>

          <section className="rounded-xl bg-[var(--bg-panel)] shadow-sm">
            <div className="flex items-center gap-2 border-b border-[var(--border-default)] p-4">
              <LifeBuoy className="text-primary-500 h-5 w-5" />
              <h2 className="font-semibold text-[var(--text-primary)]">
                {t('admin.supportQueue')}
              </h2>
              <Badge variant="secondary">{totalSupportRequests}</Badge>
            </div>
            <div className="divide-y divide-[var(--border-default)]">
              {supportRequests.map((request) => (
                <article
                  id={`support-${request.id}`}
                  key={request.id}
                  className="list-render-row scroll-mt-4 space-y-3 p-4"
                >
                  <div className="flex items-start gap-3">
                    {request.user && <Avatar user={request.user} size="sm" />}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-[var(--text-primary)]">
                        {request.user?.display_name ?? t('common.user')}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {t(`support.${request.category}`)} ·{' '}
                        {new Date(request.created_at).toLocaleString(dateLocale)}
                      </p>
                      {request.assignedAdmin && (
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          {t('support.assignedTo', {
                            name: request.assignedAdmin.display_name,
                          })}
                        </p>
                      )}
                    </div>
                    <Badge variant={request.status === 'resolved' ? 'primary' : 'secondary'}>
                      {t(`support.${request.status}`)}
                    </Badge>
                  </div>
                  <p className="text-sm whitespace-pre-wrap text-[var(--text-secondary)]">
                    {request.content}
                  </p>
                  <textarea
                    value={supportResponses[request.id] ?? request.admin_response ?? ''}
                    onChange={(event) =>
                      setSupportResponses((current) => ({
                        ...current,
                        [request.id]: event.target.value,
                      }))
                    }
                    maxLength={4000}
                    rows={2}
                    className="focus:ring-primary-500 w-full resize-y rounded-lg border border-[var(--border-default)] bg-[var(--bg-app)] px-3 py-2 text-sm focus:ring-2 focus:outline-none"
                    placeholder={t('support.adminResponse')}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === request.id}
                      onClick={() => void resolveSupport(request.id, 'in_progress')}
                    >
                      {t('support.in_progress')}
                    </Button>
                    <Button
                      size="sm"
                      disabled={busyId === request.id}
                      onClick={() => void resolveSupport(request.id, 'resolved')}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {t('support.resolved')}
                    </Button>
                  </div>
                </article>
              ))}
              {!supportRequests.length && (
                <p className="p-6 text-center text-sm text-[var(--text-muted)]">
                  {loadingDashboard ? t('common.loading') : t('support.empty')}
                </p>
              )}
            </div>
            {supportRequests.length < totalSupportRequests && (
              <div className="border-t border-[var(--border-default)] p-4 text-right">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingSupport}
                  onClick={() => void loadMoreSupport()}
                >
                  {loadingSupport ? t('common.loading') : t('admin.loadMore')}
                </Button>
              </div>
            )}
          </section>
        </main>
      </ScrollArea>
    </div>
  )
}
