interface AuthErrorLike {
  code?: string
  message: string
}

type Translate = (key: string) => string

export function getAuthErrorMessage(error: AuthErrorLike, t: Translate): string {
  const code = error.code?.toLocaleLowerCase() ?? ''
  const message = error.message.toLocaleLowerCase()

  if (
    code === 'invalid_credentials' ||
    code === 'invalid_grant' ||
    message.includes('invalid login credentials')
  ) {
    return t('auth.errorInvalidCredentials')
  }
  if (
    code === 'email_exists' ||
    code === 'user_already_exists' ||
    message.includes('already registered')
  ) {
    return t('auth.errorAccountExists')
  }
  if (code === 'email_not_confirmed' || message.includes('email not confirmed')) {
    return t('auth.errorEmailNotConfirmed')
  }
  if (code === 'weak_password' || message.includes('password should be')) {
    return t('auth.errorWeakPassword')
  }
  if (code.includes('rate_limit') || message.includes('rate limit')) {
    return t('auth.errorRateLimit')
  }

  return error.message || t('auth.errorGeneric')
}
