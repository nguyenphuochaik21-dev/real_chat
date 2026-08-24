'use client'

import { Sidebar } from '@/components/layout/sidebar'

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--bg-app)]">
      <Sidebar />
      {children}
    </div>
  )
}
