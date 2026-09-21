import pg from 'pg'

export async function provisionCallUsers() {
  if (process.env.E2E_DATABASE_CALLS !== 'true' || !process.env.DIRECT_URL) {
    throw new Error('Database call fixtures require explicit opt-in and DIRECT_URL')
  }
  const response = await fetch(
    'https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt'
  )
  if (!response.ok) throw new Error('Could not load Supabase CA')
  const db = new pg.Client({
    connectionString: process.env.DIRECT_URL,
    ssl: { rejectUnauthorized: true, ca: await response.text() },
  })
  await db.connect()
  const runId = crypto.randomUUID()
  const users = ['caller', 'receiver'].map((role) => ({
    id: crypto.randomUUID(),
    email: `call-test-${role}-${runId}@example.invalid`,
    password: `Call-${crypto.randomUUID()}-aA1!`,
    name: `Call test ${role}`,
  }))
  const conversationId = crypto.randomUUID()
  try {
    await db.query('begin')
    for (const user of users) {
      await db.query(
        `insert into auth.users (
        instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
        confirmation_token,recovery_token,email_change_token_new,email_change,
        raw_app_meta_data,raw_user_meta_data,created_at,updated_at
      ) values ('00000000-0000-0000-0000-000000000000',$1,'authenticated','authenticated',$2,
        extensions.crypt($3,extensions.gen_salt('bf')),now(),'','','','',
        '{"provider":"email","providers":["email"]}'::jsonb,$4::jsonb,now(),now())`,
        [
          user.id,
          user.email,
          user.password,
          JSON.stringify({
            chatly_e2e_run: runId,
            full_name: user.name,
            username: `call_${user.id.replaceAll('-', '').slice(0, 20)}`,
          }),
        ]
      )
      await db.query(
        `insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at)
        values ($1::text,$1::uuid,$2::jsonb,'email',now(),now())`,
        [user.id, JSON.stringify({ sub: user.id, email: user.email, email_verified: true })]
      )
    }
    await db.query("insert into public.conversations(id,type,created_by) values ($1,'direct',$2)", [
      conversationId,
      users[0].id,
    ])
    await db.query(
      'insert into public.conversation_participants(conversation_id,user_id) values ($1,$2),($1,$3)',
      [conversationId, ...users.map((user) => user.id)]
    )
    await db.query(
      "insert into public.friendships(requester_id,addressee_id,status,responded_at) values ($1,$2,'accepted',now())",
      users.map((user) => user.id)
    )
    await db.query('commit')
  } catch (error) {
    await db.query('rollback')
    await db.end()
    throw error
  }
  return {
    users,
    conversationId,
    db,
    async cleanup() {
      try {
        await db.query('begin')
        const verified = await db.query(
          "select id from auth.users where id=any($1::uuid[]) and raw_user_meta_data->>'chatly_e2e_run'=$2",
          [users.map((user) => user.id), runId]
        )
        if (verified.rowCount !== users.length)
          throw new Error('Fixture ownership verification failed; refusing cleanup')
        await db.query('delete from public.conversations where id=$1 and created_by=$2', [
          conversationId,
          users[0].id,
        ])
        await db.query(
          "delete from auth.users where id=any($1::uuid[]) and raw_user_meta_data->>'chatly_e2e_run'=$2",
          [users.map((user) => user.id), runId]
        )
        await db.query('commit')
        const remaining = await db.query('select id from auth.users where id=any($1::uuid[])', [
          users.map((user) => user.id),
        ])
        if (remaining.rowCount !== 0) throw new Error('Temporary users were not fully removed')
      } catch (error) {
        await db.query('rollback')
        throw error
      } finally {
        await db.end()
      }
    },
  }
}
