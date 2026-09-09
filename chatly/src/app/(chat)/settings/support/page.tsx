'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, CheckCircle2, MessageCircle, Send } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { VerifiedBadge } from '@/components/ui/verified-badge'
import { createConversation } from '@/lib/actions/conversations'
import {
  getMySupportRequests,
  getSupportPageData,
  submitSupportRequest,
  type SupportAdmin,
} from '@/lib/actions/support'
import { useI18n } from '@/lib/i18n'
import { queueSupportPushNotification } from '@/lib/push'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { Tables } from '@/types'
import { useRouter } from 'next/navigation'

const CATEGORIES = ['account', 'messaging', 'calling', 'privacy', 'report', 'other'] as const
const SUPPORT_PAGE_SIZE = 6

export default function SupportPage() {
  const { dateLocale, t } = useI18n()
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [admins, setAdmins] = useState<SupportAdmin[]>([])
  const [selectedAdminId, setSelectedAdminId] = useState('')
  const [requests, setRequests] = useState<Tables<'support_requests'>[]>([])
  const [totalRequests, setTotalRequests] = useState(0)
  const [requestPage, setRequestPage] = useState(0)
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('account')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    void getSupportPageData()
      .then((data) => {
        setAdmins(data.admins)
        setSelectedAdminId((current) => current || data.admins[0]?.id || '')
        setRequests(data.requests)
        setTotalRequests(data.totalRequests)
      })
      .catch((loadError: unknown) =>
        setError(loadError instanceof Error ? loadError.message : t('common.unknownError'))
      )
      .finally(() => setLoading(false))
  }, [t])

  useEffect(() => {
    const channel = supabase
      .channel(`my-support-requests:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'support_requests' },
        (payload) => {
          const request = payload.new as Tables<'support_requests'>
          setRequests((current) => current.map((item) => (item.id === request.id ? request : item)))
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase, t])

  useEffect(() => {
    if (loading || !window.location.hash.startsWith('#support-')) return
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(window.location.hash.slice(1))?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [loading, requests])

  const changeRequestPage = async (nextPage: number) => {
    if (nextPage < 0 || nextPage === requestPage) return
    setLoading(true)
    setError('')
    try {
      const result = await getMySupportRequests(nextPage * SUPPORT_PAGE_SIZE, SUPPORT_PAGE_SIZE)
      setRequests(result.requests)
      setTotalRequests(result.totalRequests)
      setRequestPage(nextPage)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('common.unknownError'))
    } finally {
      setLoading(false)
    }
  }

  const messageAdmin = async (admin: SupportAdmin) => {
    setBusy(true)
    try {
      const conversation = await createConversation(admin.id)
      router.push(`/chats/${conversation.id}`)
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : t('common.unknownError'))
      setBusy(false)
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const request = await submitSupportRequest(category, content, selectedAdminId)
      setRequestPage(0)
      setTotalRequests((current) => current + 1)
      setRequests((current) =>
        requestPage === 0 ? [request, ...current].slice(0, SUPPORT_PAGE_SIZE) : [request]
      )
      if (requestPage !== 0) {
        void getMySupportRequests(0, SUPPORT_PAGE_SIZE)
          .then((result) => {
            setRequests(result.requests)
            setTotalRequests(result.totalRequests)
          })
          .catch((loadError: unknown) => {
            setError(loadError instanceof Error ? loadError.message : t('common.unknownError'))
          })
      }
      queueSupportPushNotification(request.id, 'created')
      setContent('')
      setNotice(t('support.sent'))
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('common.unknownError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-[var(--bg-app)]">
      <header className="flex items-center gap-3 border-b border-[var(--border-default)] bg-[var(--bg-panel)] p-4">
        <Link href="/settings" aria-label={t('common.back')}>
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">{t('support.title')}</h1>
      </header>
      <ScrollArea className="flex-1">
        <main className="mx-auto w-full max-w-2xl space-y-5 p-4 sm:p-6">
          <section className="rounded-2xl bg-[var(--bg-panel)] p-4 shadow-sm">
            <div className="mb-3">
              <h2 className="font-semibold text-[var(--text-primary)]">
                {t('support.chooseAdmin')}
              </h2>
              <p className="text-xs text-[var(--text-muted)]">{t('support.chooseAdminHint')}</p>
            </div>
            {admins.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {admins.map((admin) => {
                  const selected = selectedAdminId === admin.id
                  return (
                    <div
                      key={admin.id}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border p-3 transition-colors',
                        selected
                          ? 'border-primary-500 bg-[var(--bg-active)]'
                          : 'border-[var(--border-default)]'
                      )}
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 touch-manipulation items-center gap-3 text-left transition-transform active:scale-[0.98]"
                        onClick={() => setSelectedAdminId(admin.id)}
                        aria-pressed={selected}
                      >
                        <Avatar user={admin} size="md" showStatus />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1 font-medium text-[var(--text-primary)]">
                            <span className="truncate">{admin.display_name}</span>
                            <VerifiedBadge label={t('verified.label')} />
                          </span>
                          <span className="block truncate text-xs text-[var(--text-muted)]">
                            @{admin.username}
                          </span>
                        </span>
                        {selected && <Check className="text-primary-500 h-5 w-5 shrink-0" />}
                      </button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void messageAdmin(admin)}
                        disabled={busy}
                        aria-label={`${t('support.messageAdmin')} ${admin.display_name}`}
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-muted)]">{t('support.noAdmins')}</p>
            )}
          </section>

          <form
            onSubmit={submit}
            className="space-y-4 rounded-2xl bg-[var(--bg-panel)] p-4 shadow-sm"
          >
            <h2 className="font-semibold text-[var(--text-primary)]">{t('support.newRequest')}</h2>
            <label className="block text-sm text-[var(--text-primary)]">
              {t('support.category')}
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as typeof category)}
                className="mt-1 w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] px-3 py-2"
              >
                {CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {t(`support.${item}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-[var(--text-primary)]">
              {t('support.details')}
              <textarea
                value={content}
                onChange={(event) => setContent(event.target.value)}
                minLength={5}
                maxLength={4000}
                rows={5}
                required
                placeholder={t('support.detailsPlaceholder')}
                className="focus:ring-primary-500 mt-1 w-full resize-y rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] px-3 py-2 focus:ring-2 focus:outline-none"
              />
            </label>
            <Button type="submit" disabled={busy || !selectedAdminId || content.trim().length < 5}>
              <Send className="h-4 w-4" />
              {t('support.submit')}
            </Button>
            {notice && <p className="text-sm text-emerald-500">{notice}</p>}
            {error && <p className="text-sm text-red-500">{error}</p>}
          </form>

          <section className="rounded-2xl bg-[var(--bg-panel)] shadow-sm">
            <h2 className="border-b border-[var(--border-default)] p-4 font-semibold">
              {t('support.history')}
            </h2>
            {loading ? (
              <p className="p-5 text-sm text-[var(--text-muted)]">{t('common.loading')}</p>
            ) : requests.length ? (
              <div className="divide-y divide-[var(--border-default)]">
                {requests.map((request) => (
                  <article
                    id={`support-${request.id}`}
                    key={request.id}
                    className="list-render-row scroll-mt-4 space-y-2 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {t(`support.${request.category}`)}
                        {request.assigned_admin_id && (
                          <span className="mt-0.5 block text-xs font-normal text-[var(--text-muted)]">
                            {t('support.assignedTo', {
                              name:
                                admins.find((admin) => admin.id === request.assigned_admin_id)
                                  ?.display_name ?? t('support.adminContact'),
                            })}
                          </span>
                        )}
                      </p>
                      <Badge variant={request.status === 'resolved' ? 'primary' : 'secondary'}>
                        {t(`support.${request.status}`)}
                      </Badge>
                    </div>
                    <p className="text-sm whitespace-pre-wrap text-[var(--text-secondary)]">
                      {request.content}
                    </p>
                    {request.admin_response && (
                      <div className="rounded-xl bg-[var(--bg-app)] p-3 text-sm">
                        <p className="mb-1 flex items-center gap-1 font-medium text-emerald-500">
                          <CheckCircle2 className="h-4 w-4" />
                          {t('support.adminResponse')}
                        </p>
                        <p className="whitespace-pre-wrap">{request.admin_response}</p>
                      </div>
                    )}
                    <time className="block text-xs text-[var(--text-muted)]">
                      {new Date(request.created_at).toLocaleString(dateLocale)}
                    </time>
                  </article>
                ))}
              </div>
            ) : (
              <p className="p-5 text-sm text-[var(--text-muted)]">{t('support.empty')}</p>
            )}
            {totalRequests > 0 && (
              <div className="flex items-center justify-between gap-3 border-t border-[var(--border-default)] p-4">
                <p className="text-xs text-[var(--text-muted)]">
                  {t('support.showingRequests', {
                    from: requestPage * SUPPORT_PAGE_SIZE + 1,
                    to: Math.min((requestPage + 1) * SUPPORT_PAGE_SIZE, totalRequests),
                    total: totalRequests,
                  })}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loading || requestPage === 0}
                    onClick={() => void changeRequestPage(requestPage - 1)}
                  >
                    {t('common.previous')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loading || (requestPage + 1) * SUPPORT_PAGE_SIZE >= totalRequests}
                    onClick={() => void changeRequestPage(requestPage + 1)}
                  >
                    {t('common.next')}
                  </Button>
                </div>
              </div>
            )}
          </section>
        </main>
      </ScrollArea>
    </div>
  )
}
