import { checkOrigin, errorResponse, requireAssistantUser } from '@/lib/assistant/server'

export const runtime = 'nodejs'

export async function GET() {
  try {
    await requireAssistantUser(true)
    return Response.json({ error: 'MOVED_TO_AI_AGENTS' }, { status: 410 })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT(request: Request) {
  try {
    checkOrigin(request)
    await requireAssistantUser(true)
    return Response.json({ error: 'MOVED_TO_AI_AGENTS' }, { status: 410 })
  } catch (error) {
    return errorResponse(error)
  }
}
