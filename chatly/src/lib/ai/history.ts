import type { AiHistoryMessage } from './protocol'

export function buildAiHistory(turns: { content: string; reply: string }[]): AiHistoryMessage[] {
  const pairs: AiHistoryMessage[][] = []
  let characters = 0
  for (const turn of turns.slice(-12).reverse()) {
    const content = turn.content.slice(0, 8000)
    const reply = turn.reply.slice(0, 8000)
    if (characters + content.length + reply.length > 32000) break
    characters += content.length + reply.length
    pairs.push([
      { role: 'user', content },
      { role: 'assistant', content: reply },
    ])
  }
  return pairs.reverse().flat()
}
