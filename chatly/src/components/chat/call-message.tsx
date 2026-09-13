'use client'

import { Phone, PhoneMissed, Video } from 'lucide-react'
import { readCallMessage } from '@/lib/call-message'
import type { Json } from '@/types/database'

export function CallMessage({ metadata, outgoing }: { metadata: Json; outgoing: boolean }) {
  const call = readCallMessage(metadata)
  const unanswered = !call.answered
  const Icon = unanswered ? PhoneMissed : call.video ? Video : Phone
  const title =
    call.status === 'missed'
      ? outgoing
        ? 'Không có người trả lời'
        : 'Cuộc gọi nhỡ'
      : call.status === 'declined'
        ? 'Cuộc gọi bị từ chối'
        : call.status === 'failed'
          ? 'Cuộc gọi không kết nối được'
          : unanswered
            ? 'Cuộc gọi đã hủy'
            : call.video
              ? 'Cuộc gọi video'
              : 'Cuộc gọi thoại'
  return (
    <div className="flex min-w-52 items-center gap-3 rounded-2xl bg-[var(--bg-panel)] p-4 ring-1 ring-[var(--border-default)]">
      <Icon className={`h-6 w-6 shrink-0 ${unanswered ? 'text-red-500' : 'text-emerald-500'}`} />
      <div>
        <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {call.answered ? `${call.duration} giây · ` : ''}
          {outgoing ? 'Cuộc gọi đi' : 'Cuộc gọi đến'}
        </p>
      </div>
    </div>
  )
}
