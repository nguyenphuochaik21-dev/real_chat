import Link from 'next/link'

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--bg-app)] p-6 text-center">
      <div className="max-w-sm rounded-2xl border border-[var(--border-default)] bg-[var(--bg-panel)] p-8 shadow-lg">
        <div className="bg-primary-500 mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl text-3xl font-bold text-white">
          C
        </div>
        <h1 className="text-xl font-semibold text-[var(--text-primary)]">Bạn đang ngoại tuyến</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Chatly sẽ tự kết nối lại khi thiết bị có mạng. Tin nhắn mới cần kết nối Internet.
        </p>
        <Link
          href="/chats"
          className="bg-primary-500 hover:bg-primary-600 mt-6 inline-flex h-10 items-center rounded-lg px-4 text-sm font-medium text-white"
        >
          Thử lại
        </Link>
      </div>
    </main>
  )
}
