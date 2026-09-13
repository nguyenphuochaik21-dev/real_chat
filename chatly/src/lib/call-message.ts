import type { Json } from '@/types/database'

export function readCallMessage(metadata: Json | undefined) {
  const value = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}
  const duration = typeof value.duration_seconds === 'number' ? value.duration_seconds : 0
  return {
    video: value.call_type === 'video',
    status: typeof value.status === 'string' ? value.status : 'ended',
    answered: value.answered === true,
    duration: Math.max(0, Math.floor(Number.isFinite(duration) ? duration : 0)),
  }
}
