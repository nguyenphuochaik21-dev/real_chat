import { z } from 'zod'
import { aiService, callN8n, requireAiUser } from '@/lib/ai/server'

export const runtime = 'nodejs'
export const maxDuration = 60

const inputSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  content: z.string().trim().min(1).max(8000),
})

export async function POST(request: Request) {
  // Cookie-authenticated mutations must originate from the application's own origin.
  if (request.headers.get('origin') !== new URL(request.url).origin) {
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
    let failure: string | null = null
    try {
      if (!conversation) throw new Error('Missing conversation')
      reply = await callN8n(conversation.agent_id, `chatly:${conversationId}`, content)
    } catch {
      failure =
        'Chưa nhận được phản hồi hợp lệ. n8n có thể vẫn đang xử lý; hãy tạo cuộc trò chuyện mới để thử lại.'
    }
    const { data: turn, error: saveError } = await service
      .from('ai_turns')
      .update({ reply, status: failure ? 'uncertain' : 'completed', error_message: failure })
      .eq('id', id)
      .eq('status', 'processing')
      .select('*')
      .single()
    if (saveError || !turn) throw new Error('Save failed')
    return Response.json({ turn })
  } catch {
    return Response.json(
      { error: 'Không hoàn tất được yêu cầu. Tải lại lịch sử trước khi gửi tiếp.' },
      { status: 503 }
    )
  }
}
