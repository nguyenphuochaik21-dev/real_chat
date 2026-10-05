import { checkOrigin, errorResponse, requireAssistantUser } from '@/lib/assistant/server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    checkOrigin(request)
    await requireAssistantUser(true)
    return Response.json({ error: 'MOVED_TO_AI_AGENTS' }, { status: 410 })
  } catch (error) {
    return errorResponse(error)
  }
}
