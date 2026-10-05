import {
  assistantDb,
  checkOrigin,
  errorResponse,
  requireAssistantUser,
} from '@/lib/assistant/server'
import { getDefaultAiAgent } from '@/lib/ai/server'

export const runtime = 'nodejs'

export async function GET() {
  try {
    await requireAssistantUser()
    const agent = await getDefaultAiAgent()
    return Response.json(
      {
        name: agent?.name ?? 'Chatly AI',
        description: agent?.description ?? '',
        avatar_url: agent?.avatar_url ?? '',
        welcome_message: agent?.welcome_message ?? '',
        enabled: Boolean(agent),
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    )
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request)
    const { user } = await requireAssistantUser()
    if (!(await getDefaultAiAgent())) {
      return Response.json({ error: 'AI_DISABLED' }, { status: 503 })
    }
    const { data, error } = await assistantDb().rpc('open_default_ai_assistant', {
      p_user_id: user.id,
    })
    if (error)
      return Response.json(
        { error: error.message.includes('AI_DISABLED') ? 'AI_DISABLED' : 'INTERNAL_ERROR' },
        { status: 503 }
      )
    return Response.json({ conversationId: data })
  } catch (error) {
    return errorResponse(error)
  }
}
