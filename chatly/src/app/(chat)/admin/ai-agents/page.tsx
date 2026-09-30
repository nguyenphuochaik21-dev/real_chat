import Link from 'next/link'
import { AiAgentManager } from '@/components/ai/agent-manager'
import { aiService, requireAiUser } from '@/lib/ai/server'

export default async function AiAdminPage() {
  await requireAiUser(true)
  const items = await loadAgents()
  if (items) return <AiAgentManager agents={items} />
  return (
    <div className="w-full p-6">
      <Link href="/admin">← Quản trị</Link>
      <h1 className="mt-4 text-2xl font-semibold">Thiết lập AI Agents</h1>
      <p className="mt-3">
        Cần áp dụng migration AI và cấu hình SUPABASE_SERVICE_ROLE_KEY trên server. Xem tài liệu
        docs/N8N-AI-AGENTS.md trong dự án.
      </p>
    </div>
  )
}

async function loadAgents() {
  try {
    const service = aiService()
    const [{ data: agents, error }, { data: connections, error: connectionError }] =
      await Promise.all([
        service.from('ai_agents').select('*').order('created_at', { ascending: false }),
        service.from('ai_connections').select('agent_id, chat_url, credentials'),
      ])
    if (error || connectionError) throw new Error('Migration required')
    return (agents ?? []).map((agent) => {
      const connection = connections?.find((item) => item.agent_id === agent.id)
      return {
        ...agent,
        chat_url: connection?.chat_url ?? '',
        has_credentials: Boolean(connection?.credentials),
      }
    })
  } catch {
    return null
  }
}
