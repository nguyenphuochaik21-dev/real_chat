// Isolated PostgreSQL fixture. Never reads .env or connects to production.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import pg from 'pg'

const port = Number(process.env.ASSISTANT_TEST_PG_PORT ?? 15439)
const settings = { host: '127.0.0.1', port, user: 'postgres', database: 'postgres' }
const root = new pg.Client(settings)
await root.connect()
const name = `assistant_test_${randomUUID().replaceAll('-', '')}`
await root.query(`CREATE DATABASE ${name}`)
const db = new pg.Client({ ...settings, database: name })
const migration = async (file) => db.query(await readFile(`supabase/migrations/${file}`, 'utf8'))
async function role(name, user = '') {
  await db.query('RESET ROLE')
  await db.query(
    "SELECT set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', $2, false)",
    [user, name]
  )
  await db.query(`SET ROLE ${name}`)
}
async function denied(sql, args = []) {
  await assert.rejects(() => db.query(sql, args))
  deniedChecks++
}
let assertions = 0
let deniedChecks = 0
function check(value, message) {
  assert.ok(value, message)
  assertions++
}
try {
  await db.connect()
  await db.query(`DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE service_role BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id UUID PRIMARY KEY, email TEXT, raw_user_meta_data JSONB DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID $$;
    CREATE FUNCTION auth.role() RETURNS TEXT LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role', true) $$;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
  `)
  for (const file of [
    '20250101000001_create_profiles.sql',
    '20250101000002_create_conversations.sql',
    '20250101000003_create_participants.sql',
    '20250101000004_create_messages.sql',
    '20250101000005_create_helpers_and_rls.sql',
  ])
    await migration(file)
  await db.query(`ALTER TABLE public.profiles ADD COLUMN is_suspended BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE public.conversation_participants ADD COLUMN hidden_at TIMESTAMPTZ;
    ALTER TABLE public.messages ADD COLUMN content_type TEXT DEFAULT 'text', ADD COLUMN metadata JSONB DEFAULT '{}';
    CREATE TABLE public.scheduled_messages(id UUID PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id UUID, sender_id UUID);
    GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
    GRANT USAGE ON SCHEMA public TO authenticated, service_role;
  `)
  await migration('20260929010000_ai_conversation_type.sql')
  await migration('20260929020000_chat_assistant.sql')
  const users = [randomUUID(), randomUUID()]
  await db.query('INSERT INTO auth.users(id,email) VALUES ($1,$2),($3,$4)', [
    users[0],
    'one@example.invalid',
    users[1],
    'two@example.invalid',
  ])
  await role('service_role')
  await db.query("UPDATE chat_assistant_config SET enabled=true, connection_encrypted='test-only'")
  const open = async (user) =>
    (await db.query('SELECT open_chat_assistant($1) id', [user])).rows[0].id
  const first = await open(users[0]),
    second = await open(users[1])
  check(first !== second, 'one conversation per user')
  check((await open(users[0])) === first, 'reuse conversation')
  const requestId = randomUUID()
  const begin = [users[0], first, requestId, 'Xin chào']
  check(
    (await db.query('SELECT begin_chat_assistant_request($1,$2,$3,$4) claimed', begin)).rows[0]
      .claimed,
    'first request claimed'
  )
  check(
    !(await db.query('SELECT begin_chat_assistant_request($1,$2,$3,$4) claimed', begin)).rows[0]
      .claimed,
    'duplicate request not claimed'
  )
  await denied('SELECT begin_chat_assistant_request($1,$2,$3,$4)', [
    users[1],
    first,
    randomUUID(),
    'spoof',
  ])
  await denied('SELECT begin_chat_assistant_request($1,$2,$3,$4)', [
    users[0],
    first,
    requestId,
    'changed',
  ])
  await denied('SELECT begin_chat_assistant_request($1,$2,$3,$4)', [
    users[0],
    first,
    randomUUID(),
    'busy',
  ])
  await db.query('SELECT finish_chat_assistant_request($1,$2,$3)', [requestId, 'Xin chào!', '{}'])
  await db.query('SELECT finish_chat_assistant_request($1,$2,$3)', [requestId, 'duplicate', '{}'])
  check(
    Number(
      (
        await db.query("SELECT count(*) FROM messages WHERE metadata->>'ai_request_id'=$1", [
          requestId,
        ])
      ).rows[0].count
    ) === 1,
    'exactly one reply'
  )
  await denied('SELECT begin_chat_assistant_request($1,$2,$3,$4)', [
    users[0],
    first,
    randomUUID(),
    ' ',
  ])
  await denied('SELECT begin_chat_assistant_request($1,$2,$3,$4)', [
    users[0],
    first,
    randomUUID(),
    'x'.repeat(8001),
  ])
  await db.query('UPDATE chat_assistant_config SET enabled=false')
  await denied('SELECT begin_chat_assistant_request($1,$2,$3,$4)', [
    users[0],
    first,
    randomUUID(),
    'disabled',
  ])
  await role('authenticated', users[0])
  check(
    (await db.query('SELECT * FROM messages WHERE conversation_id=$1', [first])).rows.length === 3,
    'owner history remains readable while disabled'
  )
  check(
    (await db.query('SELECT * FROM messages WHERE conversation_id=$1', [second])).rows.length === 0,
    'other history hidden by RLS'
  )
  check(
    (await db.query('SELECT * FROM conversations WHERE id=$1', [second])).rows.length === 0,
    'other conversation hidden'
  )
  await denied('SELECT * FROM chat_assistant_config')
  await denied('SELECT * FROM chat_assistant_requests')
  await denied('INSERT INTO scheduled_messages(conversation_id,sender_id) VALUES ($1,$2)', [
    first,
    users[0],
  ])
  await denied('SELECT open_chat_assistant($1)', [users[0]])
  await denied("INSERT INTO messages(conversation_id,sender_id,content) VALUES ($1,$2,'bypass')", [
    first,
    users[0],
  ])
  await denied('INSERT INTO conversation_participants(conversation_id,user_id) VALUES ($1,$2)', [
    second,
    users[0],
  ])
  await denied("UPDATE conversations SET type='group' WHERE id=$1", [first])
  await denied("INSERT INTO conversations(type,created_by) VALUES ('ai',$1)", [users[0]])
  await role('service_role')
  const human = randomUUID(),
    group = randomUUID()
  await db.query(
    "INSERT INTO conversations(id,type,created_by) VALUES ($1,'direct',$3),($2,'group',$3)",
    [human, group, users[0]]
  )
  for (const conversation of [human, group]) {
    await db.query(
      'INSERT INTO conversation_participants(conversation_id,user_id) VALUES ($1,$2),($1,$3)',
      [conversation, ...users]
    )
  }
  await role('authenticated', users[0])
  for (const conversation of [human, group]) {
    await db.query(
      "INSERT INTO messages(conversation_id,sender_id,content,content_type) VALUES ($1,$2,'existing flow','image')",
      [conversation, users[0]]
    )
  }
  check(
    (await db.query('SELECT * FROM messages WHERE conversation_id=ANY($1)', [[human, group]])).rows
      .length === 2,
    'human and group attachment flow preserved'
  )
  await role('anon')
  await denied('SELECT * FROM chat_assistant_config')
  await denied('SELECT open_chat_assistant($1)', [users[0]])
  await role('service_role')
  await db.query('UPDATE chat_assistant_config SET enabled=true')
  await db.query('UPDATE profiles SET is_suspended=true WHERE id=$1', [users[0]])
  await denied('SELECT open_chat_assistant($1)', [users[0]])
  await denied('SELECT begin_chat_assistant_request($1,$2,$3,$4)', [
    users[0],
    first,
    randomUUID(),
    'suspended',
  ])
  await db.query('UPDATE profiles SET is_suspended=false WHERE id=$1', [users[0]])
  await denied('SELECT begin_chat_assistant_request($1,$2,$3,$4)', [
    users[0],
    human,
    randomUUID(),
    'human must not invoke AI',
  ])
  const concurrent = new pg.Client({ ...settings, database: name })
  await concurrent.connect()
  try {
    await concurrent.query("SELECT set_config('request.jwt.claim.role','service_role',false)")
    await concurrent.query('SET ROLE service_role')
    const same = [users[0], first, randomUUID(), 'simultaneous request']
    const results = await Promise.all([
      db.query('SELECT begin_chat_assistant_request($1,$2,$3,$4) claimed', same),
      concurrent.query('SELECT begin_chat_assistant_request($1,$2,$3,$4) claimed', same),
    ])
    check(
      results.filter((result) => result.rows[0].claimed).length === 1,
      'concurrent retry has one claimant'
    )
    await db.query(
      "UPDATE chat_assistant_requests SET created_at=now()-interval '4 minutes' WHERE id=$1",
      [same[2]]
    )
    const next = randomUUID()
    await db.query('SELECT begin_chat_assistant_request($1,$2,$3,$4)', [
      users[0],
      first,
      next,
      'after expiry',
    ])
    check(
      (await db.query('SELECT status FROM chat_assistant_requests WHERE id=$1', [same[2]])).rows[0]
        .status === 'failed',
      'stale request released without retry'
    )
    await db.query('SELECT finish_chat_assistant_request($1,$2,$3)', [next, 'OK', '{}'])
  } finally {
    await concurrent.end()
  }
  for (let index = 0; index < 10; index++) {
    const id = randomUUID()
    await db.query('SELECT begin_chat_assistant_request($1,$2,$3,$4)', [
      users[1],
      second,
      id,
      `Rate ${index}`,
    ])
    await db.query('SELECT finish_chat_assistant_request($1,$2,$3)', [id, 'OK', '{}'])
  }
  await denied('SELECT begin_chat_assistant_request($1,$2,$3,$4)', [
    users[1],
    second,
    randomUUID(),
    'over rate limit',
  ])
  console.log(
    `PASS: ${assertions} assertions plus ${deniedChecks} denied-operation checks; local PostgreSQL only`
  )
} finally {
  await db.end()
  await root.query(`DROP DATABASE ${name}`)
  await root.end()
}
