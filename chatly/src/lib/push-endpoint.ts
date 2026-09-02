const ALLOWED_PUSH_HOSTS = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
] as const

export function isAllowedPushEndpoint(value: string) {
  if (value.length > 4_000) return false
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      (ALLOWED_PUSH_HOSTS.includes(url.hostname as (typeof ALLOWED_PUSH_HOSTS)[number]) ||
        url.hostname.endsWith('.notify.windows.com'))
    )
  } catch {
    return false
  }
}
