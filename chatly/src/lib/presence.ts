export type PresenceStatus = 'online' | 'offline' | 'away' | 'busy'

// A presence record is considered "fresh" if last_seen was within this many ms.
// Beyond that, even if status === 'online' the user is treated as offline —
// heartbeat has lapsed (closed tab, no network, etc.).
export const PRESENCE_STALE_MS = 90_000 // 90 seconds

export interface PresenceRecord {
  status: PresenceStatus | null | undefined
  lastSeen: string | null | undefined
}

/**
 * Resolve the *effective* presence for a user.
 *
 * The database stores `status` and `last_seen`. If `last_seen` is stale (older
 * than PRESENCE_STALE_MS), the user is treated as offline regardless of the
 * stored status — otherwise a user who closed their tab would stay "online"
 * forever.
 */
export function resolvePresence(record: PresenceRecord | null | undefined): PresenceStatus {
  if (!record) return 'offline'

  const rawStatus = (record.status ?? 'offline') as PresenceStatus
  const lastSeen = record.lastSeen

  if (rawStatus === 'online') {
    if (!lastSeen) return 'offline'
    const lastSeenMs = new Date(lastSeen).getTime()
    if (Number.isNaN(lastSeenMs)) return 'offline'
    const ageMs = Date.now() - lastSeenMs
    if (ageMs > PRESENCE_STALE_MS) return 'offline'
    return 'online'
  }

  return rawStatus
}

/**
 * Same as resolvePresence but returns false/true instead of a status string.
 */
export function isUserOnline(record: PresenceRecord | null | undefined): boolean {
  return resolvePresence(record) === 'online'
}
