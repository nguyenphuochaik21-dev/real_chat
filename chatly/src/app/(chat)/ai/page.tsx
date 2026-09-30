import { AiDirectory } from '@/components/ai/directory'
import { requireAiUser } from '@/lib/ai/server'

export default async function AiPage() {
  const { supabase } = await requireAiUser()
  const [{ data: agents, error }, { data: conversations }] = await Promise.all([
    supabase.from('ai_agents').select('*').eq('enabled', true).order('created_at'),
    supabase
      .from('ai_conversations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50),
  ])
  if (error)
    return <p className="p-6">AI Agents chưa được thiết lập. Vui lòng liên hệ quản trị viên.</p>
  return <AiDirectory agents={agents ?? []} conversations={conversations ?? []} />
}
