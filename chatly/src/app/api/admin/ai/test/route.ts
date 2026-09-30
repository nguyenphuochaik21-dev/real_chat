import { randomUUID } from 'node:crypto'
import {
  adminConfig,
  checkOrigin,
  errorResponse,
  invokeAssistant,
  loadConfig,
  requireAssistantUser,
} from '@/lib/assistant/server'

export const runtime = 'nodejs'
export const maxDuration = 150

export async function POST(request: Request) {
  try {
    checkOrigin(request)
    const { user } = await requireAssistantUser(true)
    const requestId = randomUUID()
    const conversationId = randomUUID()
    await invokeAssistant(await loadConfig(), {
      version: '1.0',
      event: 'connection.test',
      requestId,
      conversation: { id: conversationId },
      session: { id: conversationId },
      message: { id: requestId, text: 'Connection test', createdAt: new Date().toISOString() },
      user: { id: user.id, role: 'ADMIN' },
    })
    return Response.json(adminConfig(await loadConfig()))
  } catch (error) {
    return errorResponse(error)
  }
}
