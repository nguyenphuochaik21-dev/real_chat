const MAX_SEARCH_SNIPPET_LENGTH = 180
const SEARCH_CONTEXT_BEFORE_MATCH = 64

export function getSearchSnippet(text: string, query: string): string {
  if (text.length <= MAX_SEARCH_SNIPPET_LENGTH) return text

  const normalizedQuery = query.trim().toLocaleLowerCase()
  const matchIndex = normalizedQuery ? text.toLocaleLowerCase().indexOf(normalizedQuery) : -1
  const start =
    matchIndex >= 0
      ? Math.max(
          0,
          Math.min(
            matchIndex - SEARCH_CONTEXT_BEFORE_MATCH,
            text.length - MAX_SEARCH_SNIPPET_LENGTH
          )
        )
      : 0
  const end = Math.min(text.length, start + MAX_SEARCH_SNIPPET_LENGTH)

  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
}
