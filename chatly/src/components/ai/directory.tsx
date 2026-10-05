'use client'

import { AgentAvatar } from '@/components/ai/agent-avatar'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { createAiConversation, deleteAiConversation } from '@/lib/actions/ai'
import type { AiAgent, AiConversation } from '@/types/ai'

export function AiDirectory({
  agents,
  conversations,
}: {
  agents: AiAgent[]
  conversations: AiConversation[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  return (
    <div className="h-full w-full overflow-y-auto p-5 pb-24 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">AI Agents</h1>
          <p className="mt-2 text-[var(--text-muted)]">
            Chọn trợ lý để bắt đầu. Nội dung bạn gửi sẽ được xử lý bởi dịch vụ AI của trợ lý.
          </p>
        </header>
        <p role="alert">{error}</p>
        {!agents.length && <p>Chưa có trợ lý đang hoạt động.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          {agents.map((agent) => (
            <article
              key={agent.id}
              className="space-y-3 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-panel)] p-5"
            >
              <AgentAvatar agent={agent} />
              <h2 className="text-lg font-semibold">{agent.name}</h2>
              <p className="text-sm text-[var(--text-muted)]">{agent.description}</p>
              <Button
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  setError('')
                  try {
                    const id = await createAiConversation(agent.id)
                    router.push(`/ai/${id}`)
                  } catch {
                    setError('Không tạo được cuộc trò chuyện. Agent có thể đã tắt.')
                    setBusy(false)
                  }
                }}
              >
                Bắt đầu trò chuyện
              </Button>
            </article>
          ))}
        </div>
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">50 cuộc trò chuyện gần nhất</h2>
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className="flex items-center gap-3 rounded-xl border border-[var(--border-default)] p-4 hover:bg-[var(--bg-hover)]"
            >
              <Link href={`/ai/${conversation.id}`} className="min-w-0 flex-1">
                <span className="block truncate font-medium">{conversation.title}</span>
                <span className="text-sm text-[var(--text-muted)]">
                  {conversation.agent_id
                    ? (conversation.agent_name ??
                      agents.find((agent) => agent.id === conversation.agent_id)?.name ??
                      'Trợ lý AI')
                    : 'Trợ lý AI trước đây'}
                </span>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Xóa cuộc trò chuyện AI"
                title="Xóa cuộc trò chuyện AI"
                disabled={deletingId !== null}
                onClick={async () => {
                  if (!confirm(`Xóa cuộc trò chuyện "${conversation.title}"?`)) return
                  setDeletingId(conversation.id)
                  setError('')
                  try {
                    await deleteAiConversation(conversation.id)
                    router.refresh()
                  } catch (cause) {
                    setError(
                      cause instanceof Error ? cause.message : 'Không thể xóa cuộc trò chuyện AI.'
                    )
                  } finally {
                    setDeletingId(null)
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
