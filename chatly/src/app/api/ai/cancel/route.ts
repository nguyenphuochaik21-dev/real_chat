import { z } from 'zod'
import { stopRecordedExecution } from '@/lib/ai/executions'
import {
  AssistantError,
  assistantDb,
  checkOrigin,
  errorResponse,
  readBody,
  requireAssistantUser,
} from '@/lib/assistant/server'

export const runtime = 'nodejs'

const inputSchema = z
  .object({
    id: z.uuid(),
    conversationId: z.uuid(),
    content: z.string().trim().min(1).max(8000),
    channel: z.enum(['assistant', 'agent']),
  })
  .strict()

export async function POST(request: Request) {
  try {
    checkOrigin(request)
    const { user } = await requireAssistantUser()
    const input = inputSchema.safeParse(await readBody(request))
    if (!input.success) throw new AssistantError('INVALID_MESSAGE')
    const { id, conversationId, content, channel } = input.data
    const { data, error } = await assistantDb().rpc('cancel_ai_generation', {
      p_user_id: user.id,
      p_conversation_id: conversationId,
      p_id: id,
      p_content: content,
      p_channel: channel,
    })
    if (error || !data) {
      const forbidden =
        error?.message.includes('FORBIDDEN') || error?.message.includes('REQUEST_CONFLICT')
      throw new AssistantError(forbidden ? 'FORBIDDEN' : 'CANCEL_FAILED', forbidden ? 403 : 409)
    }
    const n8n =
      data.status === 'cancelled'
        ? await stopRecordedExecution(id, channel, user.id, conversationId)
        : undefined
    return Response.json({ ...data, n8n })
  } catch (error) {
    return errorResponse(error)
  }
}
