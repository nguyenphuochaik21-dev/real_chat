import { messageInput } from '@/lib/assistant/schema'
import { N8nError } from '@/lib/ai/protocol'
import { callN8n } from '@/lib/ai/server'
import { watchAiCancellation } from '@/lib/ai/cancellation'
import {
  AssistantError,
  assistantDb,
  checkOrigin,
  errorResponse,
  readBody,
  requireAssistantUser,
} from '@/lib/assistant/server'

export const runtime = 'nodejs'
export const maxDuration = 150

export async function POST(request: Request) {
  try {
    checkOrigin(request)
    const { supabase, user, role } = await requireAssistantUser()
    const parsed = messageInput.safeParse(await readBody(request))
    if (!parsed.success) throw new AssistantError('INVALID_MESSAGE')
    const { conversationId, requestId, message } = parsed.data
    const { data: member } = await supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id)
      .single()
    const { data: conversation } = await supabase
      .from('conversations')
      .select('type, created_by, ai_agent_id')
      .eq('id', conversationId)
      .single()
    if (!member || conversation?.type !== 'ai' || conversation.created_by !== user.id)
      throw new AssistantError('FORBIDDEN', 403)
    const db = assistantDb()
    if (!conversation.ai_agent_id) throw new AssistantError('AI_DISABLED', 503)
    const { data: claimed, error } = await db.rpc('begin_default_ai_assistant_request', {
      p_user_id: user.id,
      p_conversation_id: conversationId,
      p_id: requestId,
      p_content: message,
    })
    if (error) {
      const code = ['AI_DISABLED', 'AI_BUSY', 'RATE_LIMITED', 'REQUEST_CONFLICT', 'FORBIDDEN'].find(
        (code) => error.message.includes(code)
      )
      throw new AssistantError(
        code ?? 'INTERNAL_ERROR',
        code === 'FORBIDDEN' ? 403 : code === 'RATE_LIMITED' ? 429 : 409
      )
    }
    if (!claimed) {
      const { data: previous } = await db
        .from('chat_assistant_requests')
        .select('status, error_code')
        .eq('id', requestId)
        .single()
      return Response.json(
        { status: previous?.status, error: previous?.error_code, saved: true },
        { status: previous?.status === 'processing' ? 202 : 200 }
      )
    }
    let watcher: Awaited<ReturnType<typeof watchAiCancellation>> | undefined
    try {
      watcher = await watchAiCancellation(async () => {
        const { data, error } = await db
          .from('chat_assistant_requests')
          .select('status')
          .eq('id', requestId)
          .single()
        if (error) throw error
        return data?.status ?? null
      })
      const response = await callN8n(conversation.ai_agent_id, conversationId, message, {
        requestId,
        conversationId,
        userId: user.id,
        role,
        channel: 'assistant',
        signal: watcher.signal,
      })
      const { error: saveError } = await db.rpc('finish_chat_assistant_request', {
        p_id: requestId,
        p_text: response.text,
        p_metadata: {
          format: response.format,
          sources: response.sources,
          attachments: response.attachments,
        },
      })
      if (saveError) throw new AssistantError('INTERNAL_ERROR', 500)
      const { data: finished, error: statusError } = await db
        .from('chat_assistant_requests')
        .select('status')
        .eq('id', requestId)
        .single()
      if (statusError) throw new AssistantError('INTERNAL_ERROR', 500)
      return Response.json({ status: finished.status, saved: true })
    } catch (error) {
      const code =
        error instanceof AssistantError
          ? error.code
          : error instanceof N8nError
            ? error.code
            : 'INTERNAL_ERROR'
      const { data: status, error: failError } = await db.rpc('fail_chat_assistant_request', {
        p_id: requestId,
        p_error: code,
      })
      if (failError) throw new AssistantError('INTERNAL_ERROR', 500)
      if (status === 'cancelled' || status === 'completed') {
        return Response.json({ status, saved: true })
      }
      return Response.json(
        { error: code, saved: true },
        {
          status:
            error instanceof AssistantError ? error.status : code === 'N8N_TIMEOUT' ? 504 : 502,
        }
      )
    } finally {
      watcher?.dispose()
    }
  } catch (error) {
    return errorResponse(error)
  }
}
