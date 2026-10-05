import { z } from 'zod'
import { N8nError } from '@/lib/ai/protocol'
import { aiService, callN8n, requireAiUser } from '@/lib/ai/server'
import { watchAiCancellation } from '@/lib/ai/cancellation'
import { checkOrigin } from '@/lib/assistant/server'

export const runtime = 'nodejs'
export const maxDuration = 60

const inputSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  content: z.string().trim().min(1).max(8000),
})

export async function POST(request: Request) {
  // Cookie-authenticated mutations must originate from the application's own origin.
  try {
    checkOrigin(request)
  } catch {
    return Response.json({ error: 'Nguồn yêu cầu không hợp lệ.' }, { status: 403 })
  }
  let auth
  try {
    auth = await requireAiUser()
  } catch {
    return Response.json(
      { error: 'Vui lòng đăng nhập bằng tài khoản đang hoạt động.' },
      { status: 403 }
    )
  }
  let body: unknown
  try {
    const reader = request.body?.getReader()
    if (!reader) throw new Error('Empty body')
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 40000) throw new Error('Too large')
        chunks.push(value)
      }
    } finally {
      await reader.cancel().catch(() => undefined)
      reader.releaseLock()
    }
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return Response.json({ error: 'Nội dung không hợp lệ.' }, { status: 400 })
  }
  const input = inputSchema.safeParse(body)
  if (!input.success)
    return Response.json({ error: 'Tin nhắn phải có từ 1 đến 8000 ký tự.' }, { status: 400 })
  const { id, conversationId, content } = input.data
  try {
    const service = aiService()
    const { data: claim, error } = await service.rpc('begin_ai_turn', {
      p_user_id: auth.user.id,
      p_conversation_id: conversationId,
      p_id: id,
      p_content: content,
    })
    if (error || !claim) {
      const rate = error?.message.includes('AI_RATE')
      const busy = error?.message.includes('AI_BUSY')
      return Response.json(
        {
          error: rate
            ? 'Bạn gửi quá nhanh. Hãy đợi một phút.'
            : busy
              ? 'Hội thoại đang xử lý hoặc bị gián đoạn. Hãy đợi hoặc tạo cuộc trò chuyện mới.'
              : 'Không thể gửi tin nhắn. Agent có thể đã tắt hoặc bạn không có quyền.',
        },
        { status: rate ? 429 : 409 }
      )
    }
    if (!claim.claimed) return Response.json({ turn: claim.turn })
    const { data: conversation } = await service
      .from('ai_conversations')
      .select('agent_id')
      .eq('id', conversationId)
      .eq('user_id', auth.user.id)
      .single()
    let reply: string | null = null
    let replyAttachments: Awaited<ReturnType<typeof callN8n>>['attachments'] = []
    let failure: string | null = null
    let errorCode: string | null = null
    let watcher: Awaited<ReturnType<typeof watchAiCancellation>> | undefined
    try {
      watcher = await watchAiCancellation(async () => {
        const { data, error } = await service
          .from('ai_turns')
          .select('status')
          .eq('id', id)
          .single()
        if (error) throw error
        return data?.status ?? null
      })
      if (!conversation?.agent_id) throw new Error('Missing active agent')
      const result = await callN8n(conversation.agent_id, `chatly:${conversationId}`, content, {
        requestId: id,
        conversationId,
        userId: auth.user.id,
        channel: 'agent',
        timeoutMs: 55000,
        signal: watcher.signal,
      })
      reply = result.text
      replyAttachments = result.attachments
    } catch (error) {
      errorCode = error instanceof N8nError ? error.code : 'N8N_UNAVAILABLE'
      failure =
        errorCode === 'N8N_TIMEOUT'
          ? 'n8n phản hồi quá thời gian. Tin nhắn chưa được AI trả lời.'
          : errorCode === 'N8N_CONFIGURATION'
            ? 'Agent chưa kết nối đúng với n8n. Vui lòng báo quản trị viên kiểm tra URL hoặc xác thực.'
            : errorCode === 'N8N_AUTH_FAILED'
              ? 'n8n từ chối xác thực của agent. Vui lòng báo quản trị viên.'
              : errorCode === 'N8N_WORKFLOW_ERROR'
                ? 'Workflow n8n gặp lỗi khi xử lý bằng AI. Vui lòng thử lại sau.'
                : errorCode === 'N8N_INVALID_RESPONSE'
                  ? 'n8n trả về dữ liệu không hợp lệ. Tin nhắn chưa được AI trả lời.'
                  : 'n8n hiện không phản hồi. Tin nhắn chưa được AI trả lời.'
    } finally {
      watcher?.dispose()
    }
    const { data: turn, error: saveError } = await service
      .from('ai_turns')
      .update({
        reply,
        reply_attachments: replyAttachments,
        status: failure ? 'failed' : 'completed',
        error_message: failure,
        error_code: errorCode,
      })
      .eq('id', id)
      .eq('status', 'processing')
      .select('*')
      .maybeSingle()
    if (saveError) throw new Error('Save failed')
    if (turn) return Response.json({ turn })
    const { data: finalTurn, error: finalError } = await service
      .from('ai_turns')
      .select('*')
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .single()
    if (finalError || !finalTurn) throw new Error('Save failed')
    return Response.json({ turn: finalTurn })
  } catch {
    return Response.json(
      { error: 'Không hoàn tất được yêu cầu. Tải lại lịch sử trước khi gửi tiếp.' },
      { status: 503 }
    )
  }
}
