import assert from 'node:assert/strict'
import nextEnv from '@next/env'
import pg from 'pg'
import { readFile } from 'node:fs/promises'

nextEnv.loadEnvConfig(process.cwd())
const ca = process.env.DATABASE_CA_CERT_PATH
  ? await readFile(process.env.DATABASE_CA_CERT_PATH, 'utf8')
  : await fetch(
      'https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt',
      { signal: AbortSignal.timeout(10_000) }
    ).then((response) => {
      if (!response.ok) throw new Error('Could not load Supabase CA')
      return response.text()
    })
const db = new pg.Client({
  connectionString: process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: true, ca },
})
let checks = 0
async function asUser(id) {
  await db.query('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [id])
  await db.query('set local role authenticated')
}
async function denied(sql, params = []) {
  await db.query('savepoint denial')
  try {
    await db.query(sql, params)
  } catch (error) {
    assert.ok(['42501', 'P0001'].includes(error.code), error.message)
    await db.query('rollback to savepoint denial')
    checks++
    return
  }
  throw new Error('Expected database to reject unauthorized operation')
}
try {
  await db.connect()
  await db.query('begin')
  await db.query("set local statement_timeout = '15s'")
  const { rows: users } = await db.query(
    'select id from public.profiles where not is_suspended order by created_at limit 3'
  )
  assert.equal(users.length, 3, 'Need three existing profiles; all test changes roll back')
  const [caller, callee, outsider] = users.map((row) => row.id)
  const {
    rows: [conversation],
  } = await db.query(
    "insert into public.conversations(type,created_by) values ('direct',$1) returning id",
    [caller]
  )
  await db.query(
    'insert into public.conversation_participants(conversation_id,user_id) values ($1,$2),($1,$3)',
    [conversation.id, caller, callee]
  )
  // Select a clean pair for the transaction without modifying committed block data.
  await db.query(
    'delete from public.user_blocks where blocker_id = any($1::uuid[]) and blocked_id = any($1::uuid[])',
    [[caller, callee]]
  )
  await asUser(caller)
  const {
    rows: [{ overview }],
  } = await db.query('select public.get_friendship_overview() as overview')
  assert.equal(overview.currentUserId, caller)
  assert.ok(Array.isArray(overview.friends))
  checks++
  const {
    rows: [session],
  } = await db.query("select * from public.initiate_call($1,$2,'voice')", [callee, conversation.id])
  await denied("select public.initiate_call($1,$2,'voice')", [callee, conversation.id])
  await denied("update public.call_sessions set status='answered' where id=$1", [session.id])
  await denied(
    "insert into public.messages(conversation_id,sender_id,content,content_type) values ($1,$2,'Fake call','call')",
    [conversation.id, caller]
  )
  await denied("select public.update_call_status($1,'answered')", [session.id])
  await asUser(outsider)
  assert.equal(
    (await db.query('select id from public.call_sessions where id=$1', [session.id])).rowCount,
    0
  )
  checks++
  await denied("select public.end_call($1,'ended')", [session.id])
  await denied("select public.finalize_call_session($1,'ended',null)", [session.id])
  await asUser(callee)
  const {
    rows: [answered],
  } = await db.query("select * from public.update_call_status($1,'answered')", [session.id])
  assert.equal(answered.status, 'answered')
  checks++
  await db.query('reset role')
  await db.query(
    "update public.call_sessions set answered_at=now()-interval '12 seconds' where id=$1",
    [session.id]
  )
  await asUser(caller)
  assert.equal(
    (await db.query("select * from public.end_call($1,'missed')", [session.id])).rows[0].status,
    'answered'
  )
  checks++
  await asUser(callee)
  await db.query("select public.end_call($1,'ended')", [session.id])
  await db.query("select public.end_call($1,'ended')", [session.id])
  const { rows: history } = await db.query(
    'select * from public.call_history where session_id=$1',
    [session.id]
  )
  const { rows: messages } = await db.query(
    'select * from public.messages where call_session_id=$1',
    [session.id]
  )
  assert.equal(history.length, 1)
  assert.equal(messages.length, 1)
  assert.equal(history[0].duration_seconds, 12)
  assert.equal(messages[0].metadata.duration_seconds, 12)
  assert.equal(messages[0].metadata.answered, true)
  checks++
  await asUser(caller)
  await denied("update public.messages set metadata='{}' where id=$1", [messages[0].id])
  const summaries = (await db.query('select public.get_conversation_summaries() as value')).rows[0]
    .value
  assert.equal(
    summaries.find((item) => item.id === conversation.id).last_message.call_session_id,
    session.id
  )
  checks++
  for (const outcome of ['declined', 'missed']) {
    await asUser(caller)
    const {
      rows: [ringing],
    } = await db.query("select * from public.initiate_call($1,$2,'video')", [
      callee,
      conversation.id,
    ])
    if (outcome === 'missed') {
      await db.query('reset role')
      await db.query(
        "update public.call_sessions set started_at=now()-interval '46 seconds',created_at=now()-interval '46 seconds' where id=$1",
        [ringing.id]
      )
      await asUser(callee)
      assert.equal(
        (await db.query("select * from public.update_call_status($1,'answered')", [ringing.id]))
          .rows[0].status,
        'missed'
      )
    } else {
      await asUser(callee)
      await db.query("select public.update_call_status($1,'declined')", [ringing.id])
    }
    const {
      rows: [result],
    } = await db.query('select metadata from public.messages where call_session_id=$1', [
      ringing.id,
    ])
    assert.equal(result.metadata.status, outcome)
    assert.equal(result.metadata.duration_seconds, 0)
    checks++
  }
  await asUser(caller)
  const {
    rows: [expiryProbe],
  } = await db.query("select * from public.initiate_call($1,$2,'voice')", [callee, conversation.id])
  await db.query('reset role')
  await db.query(
    "update public.call_sessions set started_at=now()-interval '44 seconds' where id=$1",
    [expiryProbe.id]
  )
  await db.query('select public.auto_end_missed_calls()')
  assert.equal(
    (await db.query('select status from public.call_sessions where id=$1', [expiryProbe.id]))
      .rows[0].status,
    'pending'
  )
  await db.query(
    "update public.call_sessions set started_at=now()-interval '46 seconds' where id=$1",
    [expiryProbe.id]
  )
  await db.query('select public.auto_end_missed_calls()')
  assert.equal(
    (await db.query('select status from public.call_sessions where id=$1', [expiryProbe.id]))
      .rows[0].status,
    'missed'
  )
  checks += 2

  // Bounded index probe, in the same rollback-only transaction.
  await db.query(
    `insert into public.messages(conversation_id,sender_id,content,created_at)
    select $1,$2,'Pagination probe',now() - n * interval '1 second' from generate_series(1,10000) n`,
    [conversation.id, caller]
  )
  const { rows: plan } = await db.query(
    `explain (analyze, buffers, format json)
    select id,created_at from public.messages where conversation_id=$1
    order by created_at desc,id desc limit 50`,
    [conversation.id]
  )
  console.log('10,000-message pagination probe', {
    executionMs: plan[0]['QUERY PLAN'][0]['Execution Time'],
    plan: plan[0]['QUERY PLAN'][0].Plan.Plans?.[0]?.['Node Type'],
  })
  await db.query('rollback')
  console.log(`PASS: ${checks} call/contact/RLS checks; all test data rolled back`)
  console.log(
    'Integrity',
    (
      await db.query(`select
    (select count(*) from public.call_sessions s left join public.call_history h on h.session_id=s.id where s.ended_at is not null and h.id is null) as missing_history,
    (select count(*) from public.call_history h left join public.messages m on m.call_session_id=h.session_id where h.session_id is not null and h.conversation_id is not null and m.id is null) as missing_timeline,
    (select count(*) from public.call_sessions where status in ('pending','ringing') and started_at < now()-interval '50 seconds') as stale_ringing`)
    ).rows[0]
  )
  const { rows: jobs } = await db.query(
    `select jobname,schedule,active from cron.job where jobname like 'chatly-%'`
  )
  console.log('Cleanup jobs', jobs)
} catch (error) {
  await db.query('rollback').catch(() => undefined)
  console.error({ message: error.message, code: error.code })
  process.exitCode = 1
} finally {
  await db.end()
}
