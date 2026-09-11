import { createClient } from '@supabase/supabase-js'

export interface E2ECredentials {
  email: string
  password: string
}

export interface ProvisionedGroupUsers extends E2ECredentials {
  ownerId: string
  userIds: string[]
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and E2E_SUPABASE_SERVICE_ROLE_KEY are required to provision users.'
    )
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

type AdminClient = ReturnType<typeof getAdminClient>

async function deleteUsers(admin: AdminClient, userIds: string[]): Promise<string[]> {
  const errors: string[] = []

  for (const userId of userIds.toReversed()) {
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) errors.push(`user ${userId}: ${error.message}`)
  }

  return errors
}

export async function provisionGroupUsers(): Promise<ProvisionedGroupUsers> {
  const admin = getAdminClient()
  const runId = crypto.randomUUID().replaceAll('-', '').slice(0, 16)
  const password = `Chatly-${crypto.randomUUID()}-aA1!`
  const userIds: string[] = []
  const roles = ['owner', 'friend-one', 'friend-two']

  try {
    for (const role of roles) {
      const { data, error } = await admin.auth.admin.createUser({
        email: `chatly-e2e-${role}-${runId}@example.com`,
        password,
        email_confirm: true,
        user_metadata: {
          chatly_e2e: true,
          full_name: `E2E ${role}`,
          username: `e2e_${role.replace('-', '_')}_${runId}`,
        },
      })

      if (error) throw new Error(`Could not create the ${role} user: ${error.message}`)
      userIds.push(data.user.id)
    }

    const ownerId = userIds[0]
    const respondedAt = new Date().toISOString()
    const { error: friendshipError } = await admin.from('friendships').insert(
      userIds.slice(1).map((friendId) => ({
        requester_id: ownerId,
        addressee_id: friendId,
        status: 'accepted',
        responded_at: respondedAt,
      }))
    )

    if (friendshipError) {
      throw new Error(`Could not create E2E friendships: ${friendshipError.message}`)
    }

    return {
      email: `chatly-e2e-owner-${runId}@example.com`,
      password,
      ownerId,
      userIds,
    }
  } catch (error) {
    const cleanupErrors = await deleteUsers(admin, userIds)
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupErrors.map((message) => new Error(message))],
        'E2E provisioning failed and temporary users could not be fully removed.'
      )
    }
    throw error
  }
}

export async function cleanupGroupUsers(fixture: ProvisionedGroupUsers): Promise<void> {
  const admin = getAdminClient()
  const cleanupErrors: string[] = []

  const { error: conversationError } = await admin
    .from('conversations')
    .delete()
    .eq('created_by', fixture.ownerId)

  if (conversationError) cleanupErrors.push(`conversations: ${conversationError.message}`)
  cleanupErrors.push(...(await deleteUsers(admin, fixture.userIds)))

  if (cleanupErrors.length > 0) {
    throw new Error(`Could not fully clean up E2E data: ${cleanupErrors.join('; ')}`)
  }
}
