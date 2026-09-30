import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import nextEnv from '@next/env'
import pg from 'pg'

nextEnv.loadEnvConfig(process.cwd())
if (!process.env.DIRECT_URL) throw new Error('DIRECT_URL is required')
const certificate = await fetch(
  'https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt'
)
if (!certificate.ok) throw new Error('Cannot load database CA')
const db = new pg.Client({
  connectionString: process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: true, ca: await certificate.text() },
})
async function denied(sql, args = []) {
  await db.query('savepoint denied')
  let rejected = false
  try {
    await db.query(sql, args)
  } catch {
    rejected = true
  } finally {
    await db.query('rollback to savepoint denied')
  }
  assert.ok(rejected, 'Expected database to reject unauthorized/conflicting operation')
}
async function role(name, userId) {
  await db.query('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ''])
  await db.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ role: name, sub: userId }),
  ])
  await db.query(`set local role ${name}`)
}
try {
  await db.connect()
  await db.query('begin')
  await db.query("set local statement_timeout = '15s'")
  const exists = await db.query("select to_regclass('public.ai_agents') as name")
  if (!exists.rows[0].name) {
    await db.query(await readFile('supabase/migrations/20260928010000_ai_agents.sql', 'utf8'))
  }
  const prefix = `ai_${randomUUID().slice(0, 8)}`
  const { rows: users } = await db.query(
    `insert into auth.users
    (id,aud,role,email,raw_user_meta_data,created_at,updated_at)
    select gen_random_uuid(),'authenticated','authenticated',$1 || n || '@example.invalid',
    jsonb_build_object('username',$1 || n,'full_name','AI Test'),now(),now()
    from generate_series(1,2) n returning id`,
    [prefix]
  )
  const [owner, other] = users.map((user) => user.id)
  const agent = randomUUID(),
    conversation = randomUUID(),
    turn = randomUUID()
  await role('service_role')
  await db.query('select public.save_ai_agent($1,$2,$3,$4,$5,$6,$7,$8,$9)', [
    agent,
    'Test',
    '',
    '',
    '',
    true,
    'http://localhost:5678/test',
    'encrypted-placeholder',
    true,
  ])
  await db.query('insert into public.ai_conversations(id,user_id,agent_id) values($1,$2,$3)', [
    conversation,
    owner,
    agent,
  ])
  const args = [owner, conversation, turn, 'Hello']
  const begin = 'select public.begin_ai_turn($1,$2,$3,$4) as result'
  const first = await db.query(begin, args)
  assert.equal(first.rows[0].result.claimed, true)
  assert.equal((await db.query(begin, args)).rows[0].result.claimed, false)
  await denied(begin, [owner, conversation, turn, 'Changed'])
  await denied(begin, [other, conversation, randomUUID(), 'Forbidden'])
  await denied(begin, [owner, conversation, randomUUID(), 'Concurrent'])
  await role('authenticated', other)
  assert.equal((await db.query('select * from public.ai_turns where id=$1', [turn])).rowCount, 0)
  assert.equal(
    (await db.query('select * from public.ai_conversations where id=$1', [conversation])).rowCount,
    0
  )
  await denied('select * from public.ai_connections')
  await denied('update public.ai_agents set enabled=false where id=$1', [agent])
  await denied(begin, args)
  await role('authenticated', owner)
  assert.equal((await db.query('select * from public.ai_turns where id=$1', [turn])).rowCount, 1)
  await denied("update public.ai_turns set reply='Forged' where id=$1", [turn])
  await role('service_role')
  await db.query("update public.ai_turns set status='completed',reply='Hi' where id=$1", [turn])
  for (let index = 0; index < 9; index++) {
    const id = randomUUID()
    await db.query(begin, [owner, conversation, id, 'Next'])
    await db.query("update public.ai_turns set status='completed' where id=$1", [id])
  }
  await denied(begin, [owner, conversation, randomUUID(), 'Rate limited'])
  await db.query(
    "update public.ai_turns set created_at=now()-interval '2 minutes' where conversation_id=$1",
    [conversation]
  )
  await db.query('update public.ai_agents set enabled=false where id=$1', [agent])
  await denied(begin, [owner, conversation, randomUUID(), 'Disabled agent'])
  await db.query('update public.ai_agents set enabled=true where id=$1', [agent])
  await db.query('update public.profiles set is_suspended=true where id=$1', [owner])
  await denied(begin, [owner, conversation, randomUUID(), 'Suspended'])
  await db.query('update public.profiles set is_suspended=false where id=$1', [owner])
  const stale = randomUUID()
  await db.query(begin, [owner, conversation, stale, 'Interrupted'])
  await db.query("update public.ai_turns set created_at=now()-interval '2 minutes' where id=$1", [
    stale,
  ])
  await denied(begin, [owner, conversation, randomUUID(), 'Unsafe retry'])
  console.log(
    'PASS: AI migration, ownership/RLS, protected credentials, server-only writes, idempotency, serialization, rate limit, disabled agent, suspension, interrupted session. All changes rolled back.'
  )
} finally {
  await db.query('rollback').catch(() => undefined)
  await db.end()
}
