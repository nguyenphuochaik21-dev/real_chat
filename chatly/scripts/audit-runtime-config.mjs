import nextEnv from '@next/env'

nextEnv.loadEnvConfig(process.cwd())
const configured = (name) => Boolean(process.env[name]?.trim())
const serverKey = configured('SUPABASE_SERVICE_ROLE_KEY')
console.log({
  scope: 'Current local environment; verify hosting secrets separately',
  authenticationConfigured:
    configured('NEXT_PUBLIC_SUPABASE_URL') && configured('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  backgroundPushConfigured:
    configured('NEXT_PUBLIC_VAPID_PUBLIC_KEY') &&
    configured('VAPID_PRIVATE_KEY') &&
    configured('VAPID_SUBJECT') &&
    serverKey,
  missingBackgroundPushVariables: [
    'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
    'VAPID_PRIVATE_KEY',
    'VAPID_SUBJECT',
    'SUPABASE_SERVICE_ROLE_KEY',
  ].filter((name) => !configured(name)),
  storageMaintenanceConfigured:
    configured('DIRECT_URL') && (serverKey || configured('SUPABASE_SECRET_KEY')),
  turnRelayConfigured:
    configured('NEXT_PUBLIC_TURN_URL') &&
    configured('NEXT_PUBLIC_TURN_USERNAME') &&
    configured('NEXT_PUBLIC_TURN_CREDENTIAL'),
})

const exposedSecretNames = Object.keys(process.env).filter(
  (name) =>
    name.startsWith('NEXT_PUBLIC_') && /PRIVATE_KEY|SERVICE_ROLE|SECRET_KEY|DIRECT_URL/.test(name)
)
if (exposedSecretNames.length) {
  console.error('Server-only variables must not be public:', exposedSecretNames)
  process.exitCode = 1
}
