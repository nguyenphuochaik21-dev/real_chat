import { configInput } from '@/lib/assistant/schema'
import { decryptConnection, encryptConnection } from '@/lib/assistant/crypto'
import { validateWebhook } from '@/lib/assistant/gateway'
import {
  adminConfig,
  AssistantError,
  assistantDb,
  checkOrigin,
  errorResponse,
  loadConfig,
  readBody,
  requireAssistantUser,
} from '@/lib/assistant/server'

export const runtime = 'nodejs'

export async function GET() {
  try {
    await requireAssistantUser(true)
    return Response.json(adminConfig(await loadConfig()), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT(request: Request) {
  try {
    checkOrigin(request)
    await requireAssistantUser(true)
    const parsed = configInput.safeParse(await readBody(request))
    if (!parsed.success) throw new AssistantError('INVALID_CONFIG')
    const { webhookUrl, webhookSecret, ...profile } = parsed.data
    if (profile.avatar_url) {
      const avatar = new URL(profile.avatar_url)
      if (
        avatar.protocol !== 'https:' ||
        avatar.origin !== new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin ||
        !avatar.pathname.startsWith('/storage/v1/object/public/profile-avatars/')
      )
        throw new AssistantError('INVALID_AVATAR')
    }
    const current = await loadConfig()
    let encrypted = current.connection_encrypted
    if (webhookUrl || webhookSecret) {
      const previous = encrypted ? decryptConnection(encrypted) : null
      const url = webhookUrl || previous?.url
      const secret = webhookSecret || previous?.secret
      if (!url || !secret) throw new AssistantError('CONNECTION_REQUIRED')
      try {
        validateWebhook(url)
      } catch {
        throw new AssistantError('INVALID_WEBHOOK')
      }
      encrypted = encryptConnection({ url, secret })
    }
    if (profile.enabled && !encrypted) throw new AssistantError('CONNECTION_REQUIRED')
    const { error } = await assistantDb()
      .from('chat_assistant_config')
      .update({
        ...profile,
        connection_encrypted: encrypted,
        updated_at: new Date().toISOString(),
      })
      .eq('id', true)
    if (error) throw new AssistantError('INTERNAL_ERROR', 500)
    const { error: profileError } = await assistantDb()
      .from('conversations')
      .update({ title: profile.name, avatar_url: profile.avatar_url || null })
      .eq('type', 'ai')
    if (profileError) throw new AssistantError('INTERNAL_ERROR', 500)
    return Response.json(adminConfig(await loadConfig()))
  } catch (error) {
    return errorResponse(error)
  }
}
