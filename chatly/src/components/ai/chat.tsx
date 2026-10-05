'use client'

import { AgentAvatar } from '@/components/ai/agent-avatar'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Paperclip, Send, Square, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { createAiConversation, deleteAiConversation } from '@/lib/actions/ai'
import type { AiAgent, AiTurn } from '@/types/ai'

export function AiChat({
  conversationId,
  agent,
  agentName,
  isAdmin,
  initialTurns,
}: {
  conversationId: string
  agent: AiAgent | null
  agentName: string
  isAdmin: boolean
  initialTurns: AiTurn[]
}) {
  const router = useRouter()
  const [turns, setTurns] = useState(initialTurns)
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState('')
  const [isRequestError, setIsRequestError] = useState(false)
  const [submitted, setSubmitted] = useState<{ id: string; content: string } | null>(null)
  const bottom = useRef<HTMLDivElement>(null)
  const sending = useRef(false)
  const requestRef = useRef<{ id: string; content: string } | null>(null)
  const activeRequest = useRef<{
    id: string
    controller: AbortController
    discard: boolean
  } | null>(null)
  const pending = turns.some((turn) => turn.status === 'processing')
  const uncertain = turns.some((turn) => turn.status === 'uncertain')
  const canChat = Boolean(agent?.enabled && agent.available_to_users && !agent.archived_at)
  const friendlyFailure =
    'Hệ thống đang gián đoạn kỹ thuật nhỏ nên bạn vui lòng nhắn lại sau ít phút nhé! Cảm ơn bạn đã thông cảm và chờ đợi.'
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
        setTurns((current) =>
          data.reverse().map((turn) => {
            const local = current.find((item) => item.id === turn.id)
            if (
              local?.status === 'cancelled' &&
              ['processing', 'uncertain'].includes(turn.status)
            ) {
              return local
            }
            return turn.status === 'processing' && Date.now() - Date.parse(turn.created_at) > 90_000
              ? {
                  ...turn,
                  status: 'uncertain',
                  error_message: 'Phiên xử lý bị gián đoạn. Hãy tạo chat mới để tiếp tục.',
                }
              : turn
          })
        )
    }, 3000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [conversationId, pending])
  async function send() {
    if (sending.current || stopping || !content.trim() || !canChat || pending || uncertain) return
    sending.current = true
    setBusy(true)
    setError('')
    setIsRequestError(false)
    const text = content.trim()
    setContent('')
    const attempt =
      requestRef.current?.content === text
        ? requestRef.current
        : { id: crypto.randomUUID(), content: text }
    requestRef.current = attempt
    setSubmitted(attempt)
    const active = { id: attempt.id, controller: new AbortController(), discard: false }
    activeRequest.current = active
    try {
      const response = await fetch('/api/ai/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.any([active.controller.signal, AbortSignal.timeout(70_000)]),
        body: JSON.stringify({ ...attempt, conversationId }),
      })
      const result: { turn?: AiTurn; error?: string; n8n?: string } = await response.json()
      if (active.discard) return
      if (!response.ok || !result.turn) throw new Error(result.error ?? 'Không nhận được phản hồi.')
      const turn = result.turn
      setTurns((current) => [...current.filter((item) => item.id !== turn.id), turn])
      if (result.n8n === 'failed') {
        setError(
          'Đã dừng phản hồi trong Chatly, nhưng chưa xác nhận được n8n đã dừng. Hãy kiểm tra execution trong n8n.'
        )
      }
      requestRef.current = null
    } catch (cause) {
      if (active.discard) return
      setIsRequestError(true)
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
      if (data && !active.discard) {
        setTurns(data.reverse())
        if (data.some((turn) => turn.id === attempt.id)) {
          requestRef.current = null
          if (!isAdmin) setError('')
        } else {
          setContent((draft) => draft || text)
          if (!isAdmin) setError(friendlyFailure)
        }
      } else if (!isAdmin && !active.discard) {
        setError(friendlyFailure)
      }
    } finally {
      if (activeRequest.current === active) {
        activeRequest.current = null
        sending.current = false
        setBusy(false)
        setSubmitted(null)
      }
    }
  }
  async function stop() {
    const target =
      busy && requestRef.current
        ? requestRef.current
        : turns.find((turn) => turn.status === 'processing' || turn.status === 'uncertain')
    if (!target || stopping) return
    setStopping(true)
    setError('')
    setIsRequestError(false)
    try {
      const response = await fetch('/api/ai/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          id: target.id,
          content: target.content,
          conversationId,
          channel: 'agent',
        }),
      })
      const result: { turn?: AiTurn; error?: string } = await response.json()
      if (!response.ok || !result.turn) throw new Error('Chưa dừng được phản hồi. Hãy thử lại.')
      const active = activeRequest.current
      if (active?.id === target.id) {
        active.discard = true
        active.controller.abort()
        activeRequest.current = null
        sending.current = false
        setBusy(false)
        setSubmitted(null)
      }
      if (requestRef.current?.id === target.id) requestRef.current = null
      const turn = result.turn
      setTurns((current) => [...current.filter((item) => item.id !== turn.id), turn])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa dừng được phản hồi.')
    } finally {
      setStopping(false)
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
          <h1 className="truncate font-semibold">{agent?.name ?? agentName}</h1>
          <p className="text-xs text-[var(--text-muted)]">Trợ lý AI</p>
        </div>
        {canChat && (
          <Button
            variant="outline"
            disabled={busy || creating}
            onClick={async () => {
              setCreating(true)
              try {
                router.push(`/ai/${await createAiConversation(agent!.id)}`)
              } catch {
                setError('Không tạo được cuộc trò chuyện mới.')
                setIsRequestError(false)
                setCreating(false)
              }
            }}
          >
            Chat mới
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Xóa cuộc trò chuyện AI"
          title="Xóa cuộc trò chuyện AI"
          disabled={busy || pending || uncertain || creating || stopping}
          onClick={async () => {
            if (!confirm(`Xóa cuộc trò chuyện với ${agent?.name ?? agentName}?`)) return
            setCreating(true)
            setError('')
            setIsRequestError(false)
            try {
              await deleteAiConversation(conversationId)
              router.replace('/ai')
              router.refresh()
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : 'Không thể xóa cuộc trò chuyện AI.')
              setCreating(false)
            }
          }}
        >
          <Trash2 className="h-5 w-5" />
        </Button>
      </header>
      <div
        className="min-h-0 flex-1 overflow-y-auto p-4"
        role="log"
        aria-label="Lịch sử trò chuyện AI"
      >
        <div className="mx-auto max-w-3xl space-y-5">
          {agent?.welcome_message && (
            <p className="w-fit max-w-[90%] rounded-xl bg-[var(--bg-panel)] p-4 whitespace-pre-wrap">
              {agent.welcome_message}
            </p>
          )}
          {turns.length >= 100 && (
            <p className="text-sm text-[var(--text-muted)]">Đang hiển thị 100 lượt gần nhất.</p>
          )}
          {turns.map((turn) => (
            <div key={turn.id} className="space-y-3">
              <div className="bg-primary-500 ml-auto w-fit max-w-[90%] rounded-2xl p-3 text-white">
                <p className="mb-1 text-xs font-semibold">Bạn</p>
                <p className="[overflow-wrap:anywhere] whitespace-pre-wrap">{turn.content}</p>
              </div>
              {turn.reply && (
                <div className="mr-auto w-fit max-w-[90%] rounded-2xl bg-[var(--bg-panel)] p-3">
                  <p className="text-primary-500 mb-1 text-xs font-semibold">
                    {agent?.name ?? agentName}
                  </p>
                  <p className="[overflow-wrap:anywhere] whitespace-pre-wrap">{turn.reply}</p>
                  {turn.reply_attachments?.length > 0 && (
                    <ul className="mt-3 space-y-2 border-t border-[var(--border-default)] pt-3">
                      {turn.reply_attachments.map((attachment, index) => (
                        <li key={`${attachment.url}-${index}`}>
                          <a
                            href={attachment.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary-500 flex items-center gap-2 rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm hover:bg-[var(--bg-hover)]"
                          >
                            <span aria-hidden="true">
                              {attachment.type === 'image'
                                ? '🖼️'
                                : attachment.type === 'audio'
                                  ? '🔊'
                                  : attachment.type === 'file'
                                    ? '📎'
                                    : '🔗'}
                            </span>
                            <span className="truncate">
                              {attachment.title ?? attachment.name ?? 'Mở nội dung từ AI'}
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {['failed', 'uncertain'].includes(turn.status) &&
                (isAdmin ? (
                  <p
                    role="alert"
                    className="ml-auto max-w-[90%] rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300"
                  >
                    {turn.error_message ?? 'AI Agent gặp lỗi khi xử lý tin nhắn.'}
                  </p>
                ) : (
                  <div className="mr-auto w-fit max-w-[90%] rounded-2xl bg-[var(--bg-panel)] p-3">
                    <p className="text-primary-500 mb-1 text-xs font-semibold">
                      {agent?.name ?? agentName}
                    </p>
                    <p className="[overflow-wrap:anywhere] whitespace-pre-wrap">
                      {friendlyFailure}
                    </p>
                  </div>
                ))}
              {turn.status === 'cancelled' && (
                <p className="text-right text-xs text-[var(--text-muted)]">Đã dừng phản hồi.</p>
              )}
            </div>
          ))}
          {submitted && !turns.some((turn) => turn.id === submitted.id) && (
            <div className="bg-primary-500 ml-auto w-fit max-w-[90%] rounded-2xl p-3 text-white">
              <p className="mb-1 text-xs font-semibold">Bạn</p>
              <p className="[overflow-wrap:anywhere] whitespace-pre-wrap">{submitted.content}</p>
            </div>
          )}
          {error && isRequestError && !isAdmin && (
            <div className="mr-auto w-fit max-w-[90%] rounded-2xl bg-[var(--bg-panel)] p-3">
              <p className="text-primary-500 mb-1 text-xs font-semibold">
                {agent?.name ?? agentName}
              </p>
              <p className="[overflow-wrap:anywhere] whitespace-pre-wrap">{friendlyFailure}</p>
            </div>
          )}
          {(busy || pending) && (
            <p role="status" className="text-sm text-[var(--text-muted)]">
              AI đang trả lời…
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
          {error && (isAdmin || !isRequestError) && (
            <p
              role="alert"
              className={
                isAdmin && isRequestError
                  ? 'text-sm text-amber-600 dark:text-amber-400'
                  : 'text-sm text-red-500'
              }
            >
              {error}
            </p>
          )}
          {!canChat && <p>Agent hiện không nhận tin nhắn mới. Lịch sử vẫn được giữ lại.</p>}
          <p className="text-xs text-[var(--text-muted)]">
            AI có thể trả ảnh, file, âm thanh và liên kết. Upload đầu vào sẽ được bật sau khi cấu
            hình Storage cho agent.
          </p>
          <div className="flex items-end gap-2">
            <button
              type="button"
              disabled
              title="Đã chuẩn bị protocol 1.1; cần cấu hình Storage trước khi bật upload"
              aria-label="Đính kèm file (chờ cấu hình Storage)"
              className="flex h-10 w-10 shrink-0 cursor-not-allowed items-center justify-center rounded-xl border border-[var(--border-default)] text-[var(--text-muted)] opacity-60"
            >
              <Paperclip className="h-5 w-5" />
            </button>
            <textarea
              aria-label="Tin nhắn cho AI"
              placeholder="Nhập tin nhắn…"
              maxLength={8000}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
              rows={2}
              disabled={creating || !canChat}
              className="min-w-0 flex-1 resize-none rounded-xl border border-[var(--border-default)] bg-[var(--bg-panel)] p-3 focus:ring-2 focus:outline-none"
            />
            {busy || pending || uncertain ? (
              <Button
                type="button"
                aria-label="Dừng phản hồi"
                title="Dừng phản hồi"
                disabled={stopping}
                onClick={() => void stop()}
              >
                <Square className="h-5 w-5" />
              </Button>
            ) : (
              <Button
                type="submit"
                aria-label="Gửi tin nhắn"
                disabled={creating || stopping || !canChat || !content.trim()}
              >
                <Send className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>
      </form>
    </section>
  )
}
