export const AUTH_NOTICE_STORAGE_KEY = 'chatly_auth_notice'

export type AuthNotice =
  'signed-in' | 'signed-out' | 'account-created' | 'check-email' | 'password-updated'

const validNotices = new Set<AuthNotice>([
  'signed-in',
  'signed-out',
  'account-created',
  'check-email',
  'password-updated',
])

export function saveAuthNotice(notice: AuthNotice) {
  try {
    sessionStorage.setItem(AUTH_NOTICE_STORAGE_KEY, notice)
  } catch {}
}

export function consumeAuthNotice(allowedNotices?: AuthNotice[]): AuthNotice | null {
  try {
    const stored = sessionStorage.getItem(AUTH_NOTICE_STORAGE_KEY)
    if (!stored || !validNotices.has(stored as AuthNotice)) return null

    const notice = stored as AuthNotice
    if (allowedNotices && !allowedNotices.includes(notice)) return null
    sessionStorage.removeItem(AUTH_NOTICE_STORAGE_KEY)
    return notice
  } catch {
    return null
  }
}
