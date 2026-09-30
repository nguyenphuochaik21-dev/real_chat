import { messageInput } from '@/lib/assistant/schema'
import {
  AssistantError,
  assistantDb,
  checkOrigin,
  errorResponse,
  invokeAssistant,
  loadConfig,
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
      .select('type, created_by')
      .eq('id', conversationId)
      .single()
    if (!member || conversation?.type !== 'ai' || conversation.created_by !== user.id)
      throw new AssistantError('FORBIDDEN', 403)
    const db = assistantDb()
    const { data: claimed, error } = await db.rpc('begin_chat_assistant_request', {
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
    try {
      const config = await loadConfig()
      if (!config.enabled) throw new AssistantError('AI_DISABLED', 503)
      const { data: saved } = await db
        .from('messages')
        .select('created_at')
        .eq('id', requestId)
        .single()
      const response = await invokeAssistant(config, {
        version: '1.0',
        event: 'chat.message.created',
        requestId,
        conversation: { id: conversationId },
        session: { id: conversationId },
        message: {
          id: requestId,
          text: message,
          createdAt: saved?.created_at ?? new Date().toISOString(),
        },
        user: { id: user.id, role },
      })
      const { error: saveError } = await db.rpc('finish_chat_assistant_request', {
        p_id: requestId,
        p_text: response.assistant.text,
        p_metadata: {
          format: response.assistant.format,
          sources: response.assistant.sources ?? [],
        },
      })
      if (saveError) throw new AssistantError('INTERNAL_ERROR', 500)
      return Response.json({ status: 'completed', saved: true })
    } catch (error) {
      const code = error instanceof AssistantError ? error.code : 'INTERNAL_ERROR'
      await db
        .from('chat_assistant_requests')
        .update({ status: 'failed', error_code: code })
        .eq('id', requestId)
        .eq('status', 'processing')
      return Response.json(
        { error: code, saved: true },
        { status: error instanceof AssistantError ? error.status : 500 }
      )
    }
  } catch (error) {
    return errorResponse(error)
  }
}
