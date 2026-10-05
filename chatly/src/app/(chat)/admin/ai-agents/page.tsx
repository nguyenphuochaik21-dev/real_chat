import Link from 'next/link'
import { AiAgentManager } from '@/components/ai/agent-manager'
import {
  aiService,
  decryptCredentials,
  decryptHeaderSecret,
  migrateLegacyDefaultConnection,
  requireAiUser,
  validateChatUrl,
} from '@/lib/ai/server'

export default async function AiAdminPage() {
  await requireAiUser(true)
  await migrateLegacyDefaultConnection().catch(() => undefined)
  const items = await loadAgents()
  if (items) return <AiAgentManager agents={items} />
  return (
    <div className="w-full p-6">
      <Link href="/admin">← Quản trị</Link>
      <h1 className="mt-4 text-2xl font-semibold">Thiết lập AI Agents</h1>
      <p className="mt-3">
        Cần áp dụng migration AI và cấu hình SUPABASE_SERVICE_ROLE_KEY trên server. Xem tài liệu
        docs/N8N_AI_AGENTS.md trong dự án.
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
        service.from('ai_connections').select('*'),
      ])
    if (error || connectionError) throw new Error('Migration required')
    return (agents ?? []).map((agent) => {
      const connection = connections?.find((item) => item.agent_id === agent.id)
      return {
        ...agent,
        chat_url: '',
        endpoint_hostname: connection?.chat_url ? new URL(connection.chat_url).hostname : null,
        has_url: Boolean(connection?.chat_url),
        has_credentials: Boolean(connection?.credentials),
        auth_type: connection?.auth_type ?? 'none',
        auth_header_name: connection?.auth_header_name ?? 'X-N8N-SECRET',
        protocol: connection?.protocol ?? 'chat',
        timeout_ms: connection?.timeout_ms ?? 55000,
        last_status: connection?.last_status ?? 'not_tested',
        last_tested_at: connection?.last_tested_at ?? null,
        last_latency_ms: connection?.last_latency_ms ?? null,
        last_error_code: connection?.last_error_code ?? null,
        connection_issue: getConnectionIssue(agent.id, connection),
      }
    })
  } catch {
    return null
  }
}

function getConnectionIssue(
  agentId: string,
  connection:
    | {
        chat_url: string
        credentials: string | null
        auth_type: 'none' | 'basic' | 'header_secret'
      }
    | undefined
) {
  if (!connection) return 'Chưa có webhook n8n.'
  try {
    validateChatUrl(connection.chat_url)
    if (connection.auth_type === 'basic') {
      if (!connection.credentials) return 'Thiếu tài khoản Basic Auth.'
      decryptCredentials(agentId, connection.credentials)
    }
    if (connection.auth_type === 'header_secret') {
      if (!connection.credentials) return 'Thiếu secret của webhook.'
      decryptHeaderSecret(agentId, connection.credentials)
    }
    return null
  } catch (error) {
    return error instanceof Error ? error.message : 'Cấu hình n8n không hợp lệ.'
  }
}
