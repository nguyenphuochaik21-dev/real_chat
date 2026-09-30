import { Bot } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import type { AiAgent } from '@/types/ai'

export function AgentAvatar({ agent }: { agent: AiAgent | null }) {
  return agent?.avatar_url ? (
    <Avatar user={{ id: agent.id, display_name: agent.name, avatar_url: agent.avatar_url }} />
  ) : (
    <Bot className="text-primary-500 h-8 w-8 shrink-0" />
  )
}
