export async function postN8n(
  url: string,
  headers: Record<string, string>,
  sessionId: string,
  content: string,
  signal: AbortSignal = AbortSignal.timeout(55_000)
) {
  const response = await fetch(url, {
    method: 'POST',
    headers,
    redirect: 'error',
    cache: 'no-store',
    signal,
    body: JSON.stringify({ action: 'sendMessage', sessionId, chatInput: content }),
  })
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`n8n trả về HTTP ${response.status}. Kiểm tra workflow và xác thực.`)
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('n8n không trả về nội dung.')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 128_000) throw new Error('Phản hồi n8n vượt giới hạn kích thước.')
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  const item: unknown = Array.isArray(parsed) && parsed.length === 1 ? parsed[0] : parsed
  const reply =
    item && typeof item === 'object'
      ? 'output' in item
        ? item.output
        : 'text' in item
          ? item.text
          : null
      : null
  if (typeof reply !== 'string' || !reply.trim() || reply.length > 32000) {
    throw new Error('n8n cần trả JSON với trường output hoặc text, tối đa 32000 ký tự.')
  }
  return reply
}
