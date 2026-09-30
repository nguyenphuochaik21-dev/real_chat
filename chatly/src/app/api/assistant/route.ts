import {
  assistantDb,
  checkOrigin,
  errorResponse,
  loadConfig,
  publicConfig,
  requireAssistantUser,
} from '@/lib/assistant/server'

export const runtime = 'nodejs'

export async function GET() {
  try {
    await requireAssistantUser()
    return Response.json(publicConfig(await loadConfig()), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    checkOrigin(request)
    const { user } = await requireAssistantUser()
    const { data, error } = await assistantDb().rpc('open_chat_assistant', { p_user_id: user.id })
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
