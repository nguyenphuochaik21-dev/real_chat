'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, MessageCircle, Send } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { createConversation } from '@/lib/actions/conversations'
import { getSupportPageData, submitSupportRequest, type SupportAdmin } from '@/lib/actions/support'
import { useI18n } from '@/lib/i18n'
import type { Tables } from '@/types'
import { useRouter } from 'next/navigation'

const CATEGORIES = ['account', 'messaging', 'calling', 'privacy', 'report', 'other'] as const

export default function SupportPage() {
  const { dateLocale, t } = useI18n()
  const router = useRouter()
  const [admin, setAdmin] = useState<SupportAdmin | null>(null)
  const [requests, setRequests] = useState<Tables<'support_requests'>[]>([])
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('account')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    void getSupportPageData()
      .then((data) => {
        setAdmin(data.admin)
        setRequests(data.requests)
      })
      .catch((loadError: unknown) =>
        setError(loadError instanceof Error ? loadError.message : t('common.unknownError'))
      )
      .finally(() => setLoading(false))
  }, [t])

  const messageAdmin = async () => {
    if (!admin) return
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
      const request = await submitSupportRequest(category, content)
      setRequests((current) => [request, ...current].slice(0, 30))
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
          {admin && (
            <section className="flex items-center gap-3 rounded-2xl bg-[var(--bg-panel)] p-4 shadow-sm">
              <Avatar user={admin} size="lg" showStatus />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[var(--text-primary)]">{admin.display_name}</p>
                <p className="text-xs text-[var(--text-muted)]">{t('support.adminHint')}</p>
              </div>
              <Button size="sm" onClick={() => void messageAdmin()} disabled={busy}>
                <MessageCircle className="h-4 w-4" />
                {t('support.messageAdmin')}
              </Button>
            </section>
          )}

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
            <Button type="submit" disabled={busy || content.trim().length < 5}>
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
                  <article key={request.id} className="list-render-row space-y-2 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">{t(`support.${request.category}`)}</p>
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
          </section>
        </main>
      </ScrollArea>
    </div>
  )
}
