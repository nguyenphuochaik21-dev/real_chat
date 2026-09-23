import nextEnv from '@next/env'
import pg from 'pg'
import { readFile } from 'node:fs/promises'

nextEnv.loadEnvConfig(process.cwd())
if (!process.env.DIRECT_URL) throw new Error('DIRECT_URL is required')

const response = await fetch(
  'https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt'
)
if (!response.ok) throw new Error('Could not load database CA')

const db = new pg.Client({
  connectionString: process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: true, ca: await response.text() },
})
const version = '20260924010000'
const sql = await readFile(
  new URL('../supabase/migrations/20260924010000_friend_search.sql', import.meta.url),
  'utf8'
)
const correctionVersion = '20260924030000'
const correctionSql = await readFile(
  new URL('../supabase/migrations/20260924030000_friend_search_literal.sql', import.meta.url),
  'utf8'
)

try {
  await db.connect()
  await db.query('begin')
  await db.query("set local lock_timeout='5s'")
  await db.query("set local statement_timeout='30s'")

  const applied = await db.query(
    'select version from supabase_migrations.schema_migrations where version=$1',
    [version]
  )
  if (!applied.rowCount) {
    await db.query(sql)
    await db.query(
      'insert into supabase_migrations.schema_migrations(version,name,statements) values ($1,$2,$3)',
      [version, 'friend_search', [sql]]
    )
  }
  const correctionApplied = await db.query(
    'select version from supabase_migrations.schema_migrations where version=$1',
    [correctionVersion]
  )
  if (!correctionApplied.rowCount) {
    await db.query(correctionSql)
    await db.query(
      'insert into supabase_migrations.schema_migrations(version,name,statements) values ($1,$2,$3)',
      [correctionVersion, 'friend_search_literal', [correctionSql]]
    )
  }

  const functionCheck = await db.query(
    "select has_function_privilege('authenticated', 'public.search_friend_candidates(text, integer)', 'EXECUTE') as can_search"
  )
  if (!functionCheck.rows[0]?.can_search)
    throw new Error('Friend search permission verification failed')

  const admin = await db.query("select id from public.profiles where role='admin' limit 1")
  if (admin.rows[0]) {
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [admin.rows[0].id])
    const pageOne = await db.query(
      'select id, total_count from public.admin_list_users_page($1,$2,$3)',
      ['', 0, 1]
    )
    const pageTwo = await db.query(
      'select id, total_count from public.admin_list_users_page($1,$2,$3)',
      ['', 1, 1]
    )
    if (
      Number(pageOne.rows[0]?.total_count) >= 2 &&
      (pageOne.rows[0]?.id === pageTwo.rows[0]?.id ||
        pageOne.rows[0]?.total_count !== pageTwo.rows[0]?.total_count)
    ) {
      throw new Error('Admin pagination verification failed')
    }
    if (Number(pageOne.rows[0]?.total_count) > 20) {
      const fullFirstPage = await db.query(
        'select id from public.admin_list_users_page($1,$2,$3)',
        ['', 0, 20]
      )
      const firstNextPage = await db.query(
        'select id from public.admin_list_users_page($1,$2,$3)',
        ['', 20, 20]
      )
      if (
        fullFirstPage.rows.length !== 20 ||
        !firstNextPage.rows.length ||
        fullFirstPage.rows.some((row) => row.id === firstNextPage.rows[0].id)
      ) {
        throw new Error('Admin 20-item page verification failed')
      }
      console.log('Admin pagination: 20-item Next page verified against live data.')
    } else {
      console.log('Admin pagination: offset and total verified; fewer than 21 users exist.')
    }
  } else {
    console.log('Admin pagination: no admin account available for database verification.')
  }

  await db.query('commit')
  console.log(
    applied.rowCount && correctionApplied.rowCount
      ? 'Friend search migrations already applied.'
      : 'Friend search migrations applied and recorded.'
  )
} catch (error) {
  await db.query('rollback').catch(() => undefined)
  console.error({ message: error.message, code: error.code })
  process.exitCode = 1
} finally {
  await db.end()
}
