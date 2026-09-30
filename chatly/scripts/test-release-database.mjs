import assert from 'node:assert/strict'
import nextEnv from '@next/env'
import pg from 'pg'

nextEnv.loadEnvConfig(process.cwd())
if (!process.env.DIRECT_URL) throw new Error('DIRECT_URL is required')
const caResponse = await fetch(
  'https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt',
  { signal: AbortSignal.timeout(10_000) }
)
if (!caResponse.ok) throw new Error('Could not load database CA')
const db = new pg.Client({
  connectionString: process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: true, ca: await caResponse.text() },
})
let checks = 0
let phase = 'setup'
async function asUser(id) {
  await db.query('reset role')
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id])
  await db.query("select set_config('request.jwt.claims',$1,true)", [
    JSON.stringify({ sub: id, role: 'authenticated' }),
  ])
  await db.query('set local role authenticated')
}
async function denied(sql, parameters, codes = ['42501', 'P0001']) {
  await db.query('savepoint denied_operation')
  let rejected = false
  try {
    await db.query(sql, parameters)
  } catch (error) {
    assert.ok(codes.includes(error.code), `Unexpected error code: ${error.code}`)
    rejected = true
  } finally {
    await db.query('rollback to savepoint denied_operation')
    await db.query('release savepoint denied_operation')
  }
  assert.ok(rejected, `Unauthorized operation was accepted: ${phase}`)
  checks++
}

try {
  await db.connect()
  await db.query('begin')
  await db.query("set local statement_timeout='15s'")
  const prefix = `qa_${crypto.randomUUID().slice(0, 8)}`
  const { rows: users } = await db.query(
    `insert into auth.users(id,aud,role,email,raw_user_meta_data,created_at,updated_at)
     select gen_random_uuid(),'authenticated','authenticated',$1 || '_' || n || '@example.invalid',
       jsonb_build_object('username',$1 || '_' || n,'full_name','Audit user ' || n),now(),now()
     from generate_series(1,25) n returning id`,
    [prefix]
  )
  const [owner, member, peer, outsider] = users.map((user) => user.id)
  await db.query("update public.profiles set role='admin' where id=$1", [owner])
  await db.query(
    "update public.profiles set phone='0900000000',phone_visibility='private' where id=$1",
    [member]
  )
  await db.query(
    "insert into public.friendships(requester_id,addressee_id,status) values ($1,$2,'accepted'),($1,$3,'accepted')",
    [owner, member, peer]
  )
  await asUser(owner)
  phase = 'admin pagination'
  const first = await db.query('select * from public.admin_list_users_page($1,0,20)', [prefix])
  const second = await db.query('select * from public.admin_list_users_page($1,20,20)', [prefix])
  assert.equal(first.rowCount, 20)
  assert.equal(second.rowCount, 5)
  assert.equal(Number(first.rows[0].total_count), 25)
  assert.equal(new Set([...first.rows, ...second.rows].map((row) => row.id)).size, 25)
  checks++

  phase = 'group creation and membership'
  const group = (
    await db.query("select public.create_group_conversation('Audit group',$1::uuid[]) as id", [
      [member, peer],
    ])
  ).rows[0].id
  assert.equal(
    (
      await db.query(
        'select user_id from public.conversation_participants where conversation_id=$1',
        [group]
      )
    ).rowCount,
    3
  )
  const message = (
    await db.query(
      "insert into public.messages(conversation_id,sender_id,content) values ($1,$2,'Audit message') returning id",
      [group, owner]
    )
  ).rows[0].id
  checks++

  await asUser(outsider)
  phase = 'private conversation access'
  assert.equal(
    (await db.query('select id from public.messages where id=$1', [message])).rowCount,
    0
  )
  assert.equal(
    (await db.query('select id from public.conversations where id=$1', [group])).rowCount,
    0
  )
  checks++
  await denied('select public.delete_conversation_permanently($1)', [group])
  await denied("select public.update_group_details($1,'Hijacked',null)", [group])
  await denied('select * from public.admin_list_users_page()', [])
  phase = 'profile privacy and privilege escalation'
  await denied("update public.profiles set role='admin' where id=$1", [outsider])
  await denied('select phone from public.profiles where id=$1', [member])
  assert.equal(
    (await db.query('select public.get_public_profile($1) as profile', [member])).rows[0].profile
      .phone,
    null
  )
  checks++

  await asUser(member)
  phase = 'message ownership'
  await denied(
    "insert into public.messages(conversation_id,sender_id,content) values ($1,$2,'Spoofed')",
    [group, owner]
  )
  assert.equal(
    (
      await db.query("update public.messages set content='Tampered' where id=$1 returning id", [
        message,
      ])
    ).rowCount,
    0
  )
  checks++
  await denied('select public.delete_own_message($1)', [message])
  phase = 'group member cannot promote self'
  await denied("select public.set_group_member_role($1,$2,'admin')", [group, member])
  await denied('select public.remove_group_member($1,$2)', [group, owner])
  phase = 'name constraints'
  await denied(
    "update public.profiles set display_name=repeat('x',26) where id=$1",
    [member],
    ['23514', 'P0001']
  )

  await asUser(owner)
  phase = 'group owner management'
  await db.query("select public.set_group_member_role($1,$2,'admin')", [group, member])
  await db.query("select public.update_group_details($1,'Renamed audit group',null)", [group])
  assert.equal(
    (await db.query('select title from public.conversations where id=$1', [group])).rows[0].title,
    'Renamed audit group'
  )
  checks++

  phase = 'literal admin search'
  assert.equal(
    (await db.query('select * from public.admin_list_users_page($1,0,20)', [`${prefix}%`]))
      .rowCount,
    0
  )
  checks++
  phase = 'suspended account cannot send messages'
  await db.query('reset role')
  await db.query('update public.profiles set is_suspended=true where id=$1', [member])
  await asUser(member)
  await denied(
    "insert into public.messages(conversation_id,sender_id,content) values ($1,$2,'Suspended sender')",
    [group, member]
  )
  phase = 'suspended group admin cannot mutate through a definer RPC'
  await denied("select public.update_group_details($1,'Suspended edit',null)", [group])
  assert.equal(
    (await db.query('select public.can_send_message($1) as allowed', [group])).rows[0].allowed,
    false
  )
  checks++
  console.log(
    `PASS: ${checks} release database checks; 25 temporary accounts and all changes rolled back`
  )
} catch (error) {
  console.error({ phase, message: error.message, code: error.code })
  process.exitCode = 1
} finally {
  await db.query('rollback').catch(() => undefined)
  await db.end()
}
