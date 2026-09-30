'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bot } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function AssistantEntry() {
  const router = useRouter()
  const [profile, setProfile] = useState<{
    name: string
    description: string
    enabled: boolean
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    void fetch('/api/assistant')
      .then(async (response) => {
        if (response.ok) setProfile(await response.json())
      })
      .catch(() => {})
  }, [])
  if (!profile?.enabled) return null
  return (
    <div className="border-b border-[var(--border-default)] p-3">
      <Button
        variant="ghost"
        className="w-full justify-start gap-3"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setError('')
          try {
            const response = await fetch('/api/assistant', { method: 'POST' })
            if (!response.ok) throw new Error()
            const body = await response.json()
            router.push(`/chats/${body.conversationId}`)
          } catch {
            setError('Trợ lý AI hiện chưa sẵn sàng.')
          } finally {
            setBusy(false)
          }
        }}
      >
        <Bot className="h-5 w-5" />
        <span className="truncate">{profile.name}</span>
      </Button>
      {profile.description && (
        <p className="truncate text-xs text-[var(--text-muted)]">{profile.description}</p>
      )}
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
    </div>
  )
}
