import { assistantResponse } from '@/lib/assistant/schema'
import type { Json } from '@/types'

function formatSize(bytes?: number) {
  if (bytes === undefined) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AssistantSources({ metadata }: { metadata: Json }) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  if (metadata.sender_type !== 'ai') return null
  const sources = assistantResponse.shape.assistant.shape.sources.safeParse(metadata.sources)
  const attachments = assistantResponse.shape.assistant.shape.attachments.safeParse(
    metadata.attachments
  )
  const safeSources = sources.success ? (sources.data ?? []) : []
  const safeAttachments = attachments.success ? (attachments.data ?? []) : []
  if (!safeSources.length && !safeAttachments.length) return null
  return (
    <div className="mt-2 space-y-2 border-t border-current/20 pt-2 text-xs">
      {safeAttachments.length > 0 && (
        <ul aria-label="Tệp và liên kết do AI trả về" className="space-y-1.5">
          {safeAttachments.map((attachment, index) => (
            <li key={`${attachment.url}-${index}`}>
              <a
                href={attachment.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-md border border-current/20 px-2 py-1.5 underline"
              >
                <span aria-hidden="true">
                  {attachment.type === 'image'
                    ? '🖼️'
                    : attachment.type === 'audio'
                      ? '🔊'
                      : attachment.type === 'file'
                        ? '📎'
                        : '🔗'}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {attachment.title ?? attachment.name ?? 'Mở nội dung'}
                </span>
                {attachment.size !== undefined && (
                  <span className="shrink-0 opacity-70">{formatSize(attachment.size)}</span>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
      {safeSources.length > 0 && (
        <ul aria-label="Nguồn tham khảo" className="space-y-1">
          {safeSources.map((source, index) => (
            <li key={`${source.documentId ?? source.url ?? index}`}>
              {source.url ? (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {source.title}
                </a>
              ) : (
                source.title
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
