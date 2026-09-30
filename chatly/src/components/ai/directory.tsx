'use client'

import { AgentAvatar } from '@/components/ai/agent-avatar'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { createAiConversation } from '@/lib/actions/ai'
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
            <Link
              key={conversation.id}
              href={`/ai/${conversation.id}`}
              className="block rounded-xl border border-[var(--border-default)] p-4 hover:bg-[var(--bg-hover)]"
            >
              <span className="block truncate font-medium">{conversation.title}</span>
              <span className="text-sm text-[var(--text-muted)]">
                {agents.find((agent) => agent.id === conversation.agent_id)?.name ??
                  'Trợ lý đã tắt'}
              </span>
            </Link>
          ))}
        </section>
      </div>
    </div>
  )
}
