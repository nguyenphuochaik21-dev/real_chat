'use client'

import { AgentAvatar } from '@/components/ai/agent-avatar'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { createAiConversation } from '@/lib/actions/ai'
import type { AiAgent, AiTurn } from '@/types/ai'

export function AiChat({
  conversationId,
  agent,
  initialTurns,
}: {
  conversationId: string
  agent: AiAgent | null
  initialTurns: AiTurn[]
}) {
  const router = useRouter()
  const [turns, setTurns] = useState(initialTurns)
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [submittedText, setSubmittedText] = useState('')
  const bottom = useRef<HTMLDivElement>(null)
  const sending = useRef(false)
  const requestRef = useRef<{ id: string; content: string } | null>(null)
  const pending = turns.some((turn) => turn.status === 'processing')
  const uncertain = turns.some((turn) => turn.status === 'uncertain')
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [turns, busy])
  useEffect(() => {
    if (!pending) return
    let active = true
    const client = createClient()
    const timer = setInterval(async () => {
      const { data } = await client
        .from('ai_turns')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(100)
      if (active && data)
        setTurns(
          data.reverse().map((turn) =>
            turn.status === 'processing' && Date.now() - Date.parse(turn.created_at) > 90_000
              ? {
                  ...turn,
                  status: 'uncertain',
                  error_message: 'Phiên xử lý bị gián đoạn. Hãy tạo chat mới để tiếp tục.',
                }
              : turn
          )
        )
    }, 3000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [conversationId, pending])
  async function send() {
    if (sending.current || !content.trim() || !agent?.enabled || pending || uncertain) return
    sending.current = true
    setBusy(true)
    setError('')
    const text = content.trim()
    setSubmittedText(text)
    const attempt =
      requestRef.current?.content === text
        ? requestRef.current
        : { id: crypto.randomUUID(), content: text }
    requestRef.current = attempt
    try {
      const response = await fetch('/api/ai/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(70_000),
        body: JSON.stringify({ ...attempt, conversationId }),
      })
      const result: { turn?: AiTurn; error?: string } = await response.json()
      if (!response.ok || !result.turn) throw new Error(result.error ?? 'Không nhận được phản hồi.')
      const turn = result.turn
      setTurns((current) => [...current.filter((item) => item.id !== turn.id), turn])
      setContent('')
      requestRef.current = null
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Mất kết nối. Kiểm tra lịch sử trước khi gửi tiếp.'
      )
      const { data } = await createClient()
        .from('ai_turns')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(100)
      if (data) {
        setTurns(data.reverse())
        if (data.some((turn) => turn.id === attempt.id)) {
          setContent('')
          requestRef.current = null
        }
      }
    } finally {
      sending.current = false
      setBusy(false)
      setSubmittedText('')
    }
  }
  return (
    <section className="flex h-full min-h-0 w-full flex-col bg-[var(--bg-app)]">
      <header className="flex items-center gap-3 border-b border-[var(--border-default)] p-4">
        <Link href="/ai" aria-label="Quay lại danh sách AI Agents">
          ←
        </Link>
        <AgentAvatar agent={agent} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">{agent?.name ?? 'Trợ lý đã tắt'}</h1>
          <p className="text-xs text-[var(--text-muted)]">Trợ lý AI</p>
        </div>
        {agent?.enabled && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                router.push(`/ai/${await createAiConversation(agent.id)}`)
              } catch {
                setError('Không tạo được cuộc trò chuyện mới.')
                setBusy(false)
              }
            }}
          >
            Chat mới
          </Button>
        )}
      </header>
      <div
        className="min-h-0 flex-1 overflow-y-auto p-4"
        role="log"
        aria-label="Lịch sử trò chuyện AI"
      >
        <div className="mx-auto max-w-3xl space-y-5">
          {agent?.welcome_message && (
            <p className="rounded-xl bg-[var(--bg-panel)] p-4 whitespace-pre-wrap">
              {agent.welcome_message}
            </p>
          )}
          {turns.length >= 100 && (
            <p className="text-sm text-[var(--text-muted)]">Đang hiển thị 100 lượt gần nhất.</p>
          )}
          {turns.map((turn) => (
            <div key={turn.id} className="space-y-3">
              <div className="bg-primary-500 ml-auto max-w-[90%] rounded-2xl p-3 text-white">
                <p className="mb-1 text-xs font-semibold">Bạn</p>
                <p className="[overflow-wrap:anywhere] whitespace-pre-wrap">{turn.content}</p>
              </div>
              {turn.reply && (
                <div className="mr-auto max-w-[90%] rounded-2xl bg-[var(--bg-panel)] p-3">
                  <p className="text-primary-500 mb-1 text-xs font-semibold">
                    {agent?.name ?? 'AI'}
                  </p>
                  <p className="[overflow-wrap:anywhere] whitespace-pre-wrap">{turn.reply}</p>
                </div>
              )}
              {turn.error_message && <p className="text-sm text-amber-600">{turn.error_message}</p>}
            </div>
          ))}
          {submittedText && (
            <div className="bg-primary-500 ml-auto max-w-[90%] rounded-2xl p-3 text-white">
              <p className="mb-1 text-xs font-semibold">Bạn</p>
              <p className="[overflow-wrap:anywhere] whitespace-pre-wrap">{submittedText}</p>
            </div>
          )}
          {(busy || pending) && (
            <p role="status" className="text-sm text-[var(--text-muted)]">
              Đang chờ phản hồi… Nếu phiên bị gián đoạn, bạn có thể tạo chat mới.
            </p>
          )}
          <div ref={bottom} />
        </div>
      </div>
      <form
        className="border-t border-[var(--border-default)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        <div className="mx-auto max-w-3xl space-y-2">
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
          {!agent?.enabled && <p>Agent hiện không nhận tin nhắn.</p>}
          <div className="flex items-end gap-2">
            <textarea
              aria-label="Tin nhắn cho AI"
              placeholder="Nhập tin nhắn…"
              maxLength={8000}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              rows={2}
              disabled={busy || pending || uncertain || !agent?.enabled}
              className="min-w-0 flex-1 resize-none rounded-xl border border-[var(--border-default)] bg-[var(--bg-panel)] p-3 focus:ring-2 focus:outline-none"
            />
            <Button
              type="submit"
              aria-label="Gửi tin nhắn"
              disabled={busy || pending || uncertain || !agent?.enabled || !content.trim()}
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </form>
    </section>
  )
}
