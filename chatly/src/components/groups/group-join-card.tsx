'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock3, UsersRound } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { joinGroupFromShare, type GroupShareInfo } from '@/lib/actions/groups'
import { useI18n } from '@/lib/i18n'

export function GroupJoinCard({ token, group }: { token: string; group: GroupShareInfo }) {
  const { t } = useI18n()
  const router = useRouter()
  const [status, setStatus] = useState<'idle' | 'pending' | 'joined'>(
    group.is_member ? 'joined' : group.request_pending ? 'pending' : 'idle'
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const join = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await joinGroupFromShare(token)
      setStatus(result)
      if (result === 'joined') router.replace(`/chats/${group.id}`)
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : t('common.unknownError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex h-full flex-1 items-center justify-center bg-[var(--bg-app)] p-4">
      <section className="w-full max-w-md rounded-2xl bg-[var(--bg-panel)] p-7 text-center shadow-sm">
        <Avatar
          user={{ id: group.id, display_name: group.title, avatar_url: group.avatar_url }}
          size="2xl"
        />
        <h1 className="mt-4 text-2xl font-bold text-[var(--text-primary)]">{group.title}</h1>
        <p className="mt-2 flex items-center justify-center gap-2 text-sm text-[var(--text-muted)]">
          <UsersRound className="h-4 w-4" />
          {t('group.membersCount', { count: group.member_count })}
        </p>
        {status === 'joined' ? (
          <Button className="mt-6" onClick={() => router.replace(`/chats/${group.id}`)}>
            <CheckCircle2 className="h-4 w-4" />
            {t('group.joined')}
          </Button>
        ) : status === 'pending' ? (
          <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-amber-500/10 px-4 py-2 text-sm text-amber-500">
            <Clock3 className="h-4 w-4" />
            {t('group.joinPending')}
          </p>
        ) : (
          <Button className="mt-6" onClick={() => void join()} disabled={busy}>
            {busy ? t('common.loading') : t('group.join')}
          </Button>
        )}
        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
      </section>
    </main>
  )
}
