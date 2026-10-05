import { notFound } from 'next/navigation'
import { z } from 'zod'
import { AiChat } from '@/components/ai/chat'
import { requireAiUser } from '@/lib/ai/server'

export default async function AiConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const { supabase, isAdmin } = await requireAiUser()
  const { data: conversation } = await supabase
    .from('ai_conversations')
    .select('*')
    .eq('id', id)
    .single()
  if (!conversation) notFound()
  const [{ data: agent }, { data: turns, error }] = await Promise.all([
    conversation.agent_id
      ? supabase.from('ai_agents').select('*').eq('id', conversation.agent_id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from('ai_turns')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(100),
  ])
  if (error) throw new Error('Không tải được lịch sử AI.')
  return (
    <AiChat
      key={id}
      conversationId={id}
      isAdmin={isAdmin}
      agent={agent}
      agentName={
        conversation.agent_id ? (conversation.agent_name ?? 'Trợ lý AI') : 'Trợ lý AI trước đây'
      }
      initialTurns={(turns ?? []).reverse()}
    />
  )
}
