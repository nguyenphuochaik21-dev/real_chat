export default function ChatLoading() {
  return (
    <div
      className="flex min-w-0 flex-1 flex-col bg-[var(--bg-app)]"
      role="status"
      aria-label="Loading"
    >
      <div className="flex h-16 items-center gap-3 border-b border-[var(--border-default)] bg-[var(--bg-panel)] px-4">
        <div className="h-9 w-9 animate-pulse rounded-full bg-[var(--bg-hover)]" />
        <div className="h-4 w-40 animate-pulse rounded-full bg-[var(--bg-hover)]" />
      </div>
      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-4 p-4 sm:p-6 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-2xl bg-[var(--bg-panel)] shadow-sm"
          />
        ))}
      </div>
      <span className="sr-only">Loading</span>
    </div>
  )
}
