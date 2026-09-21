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
const version = '20260920010000'
const sql = await readFile(
  new URL('../supabase/migrations/20260920010000_profile_identity_limits.sql', import.meta.url),
  'utf8'
)
try {
  await db.connect()
  await db.query('begin')
  await db.query("set local lock_timeout='5s'")
  await db.query("set local statement_timeout='30s'")
  const history = await db.query(
    "select to_regclass('supabase_migrations.schema_migrations') as table_name"
  )
  if (!history.rows[0].table_name) throw new Error('Migration history table unavailable')
  const applied = await db.query(
    'select version from supabase_migrations.schema_migrations where version=$1',
    [version]
  )
  if (!applied.rowCount) {
    await db.query(sql)
    await db.query(
      'insert into supabase_migrations.schema_migrations(version,name,statements) values ($1,$2,$3)',
      [version, 'profile_identity_limits', [sql]]
    )
  }
  const trigger = await db.query(
    "select tgname from pg_trigger where tgrelid='public.profiles'::regclass and tgname='enforce_profile_identity_limits_trigger' and tgenabled='O'"
  )
  if (trigger.rowCount !== 1) throw new Error('Profile identity trigger verification failed')
  await db.query('commit')
  console.log(
    applied.rowCount
      ? 'Migration already applied; trigger verified.'
      : 'Profile identity migration applied and recorded; trigger verified.'
  )
} catch (error) {
  await db.query('rollback').catch(() => undefined)
  console.error({ message: error.message, code: error.code })
  process.exitCode = 1
} finally {
  await db.end()
}
