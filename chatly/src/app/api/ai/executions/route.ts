import { z } from 'zod'
import { verifyExecutionToken } from '@/lib/ai/execution-control'
import { stopRecordedExecution } from '@/lib/ai/executions'
import { aiService } from '@/lib/ai/server'
import { readBody } from '@/lib/assistant/server'

export const runtime = 'nodejs'

const inputSchema = z.object({ executionId: z.string().regex(/^[1-9][0-9]{0,19}$/) }).strict()

export async function POST(request: Request) {
  let identity
  try {
    const authorization = request.headers.get('authorization') ?? ''
    if (!authorization.startsWith('Bearer ')) throw new Error('Missing token')
    identity = verifyExecutionToken(authorization.slice(7))
  } catch {
    return Response.json({ error: 'INVALID_EXECUTION_TOKEN' }, { status: 401 })
  }
  try {
    const input = inputSchema.safeParse(await readBody(request))
    if (!input.success) return Response.json({ error: 'INVALID_EXECUTION_ID' }, { status: 400 })
    const { data: status, error } = await aiService().rpc('register_n8n_execution', {
      p_id: identity.requestId,
      p_user_id: identity.userId,
      p_conversation_id: identity.conversationId,
      p_agent_id: identity.agentId,
      p_channel: identity.channel,
      p_execution_id: input.data.executionId,
      p_api_url: identity.apiUrl,
    })
    if (error || !status) return Response.json({ error: 'EXECUTION_CONFLICT' }, { status: 409 })
    const n8n =
      status === 'cancelled'
        ? await stopRecordedExecution(
            identity.requestId,
            identity.channel,
            identity.userId,
            identity.conversationId
          )
        : undefined
    return Response.json({ status, cancelled: status !== 'processing', n8n })
  } catch {
    return Response.json({ error: 'EXECUTION_REGISTRATION_FAILED' }, { status: 503 })
  }
}
