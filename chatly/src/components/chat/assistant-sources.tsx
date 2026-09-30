import { assistantResponse } from '@/lib/assistant/schema'
import type { Json } from '@/types'

export function AssistantSources({ metadata }: { metadata: Json }) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  if (metadata.sender_type !== 'ai') return null
  const parsed = assistantResponse.shape.assistant.shape.sources.safeParse(metadata.sources)
  if (!parsed.success || !parsed.data?.length) return null
  return (
    <ul
      aria-label="Nguồn tham khảo"
      className="mt-2 space-y-1 border-t border-current/20 pt-2 text-xs"
    >
      {parsed.data.map((source, index) => (
        <li key={`${source.documentId ?? source.url ?? index}`}>
          {source.url ? (
            <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline">
              {source.title}
            </a>
          ) : (
            source.title
          )}
        </li>
      ))}
    </ul>
  )
}
