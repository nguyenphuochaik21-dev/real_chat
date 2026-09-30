'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export interface ErrorRecoveryProps {
  error: Error & { digest?: string }
  retry: () => void
}

export function ErrorRecovery({ error, retry }: ErrorRecoveryProps) {
  useEffect(() => {
    console.error('Chatly could not render this page', { digest: error.digest })
  }, [error])

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--bg-app)] p-6 text-center">
      <div role="alert" className="max-w-md space-y-4 text-[var(--text-primary)]">
        <h1 className="text-xl font-semibold">Tạm thời không thể mở trang</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Bạn có thể thử lại hoặc quay về danh sách trò chuyện.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={retry}
            className="bg-primary-500 hover:bg-primary-600 rounded-lg px-4 py-3 font-medium text-white"
          >
            Thử lại
          </button>
          <Link
            href="/chats"
            className="rounded-lg border border-[var(--border-default)] px-4 py-3 font-medium"
          >
            Về trang trò chuyện
          </Link>
        </div>
      </div>
    </main>
  )
}
