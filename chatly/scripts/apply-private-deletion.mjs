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
const lifecycle = process.argv.includes('--lifecycle')
const version = lifecycle ? '20260923010000' : '20260922010000'
const name = lifecycle ? 'storage_retry_lifecycle' : 'private_deletion_storage'
const sql = await readFile(
  new URL(`../supabase/migrations/${version}_${name}.sql`, import.meta.url),
  'utf8'
)
try {
  await db.connect()
  await db.query('begin')
  await db.query("set local lock_timeout='5s'")
  await db.query("set local statement_timeout='60s'")
  const applied = await db.query(
    'select version from supabase_migrations.schema_migrations where version=$1',
    [version]
  )
  if (!applied.rowCount) {
    const {
      rows: [audit],
    } = await db.query(
      'select count(*)::int as previously_deleted_messages from public.messages where deleted_at is not null'
    )
    console.log(audit)
    await db.query(sql)
    await db.query(
      'insert into supabase_migrations.schema_migrations(version,name,statements) values ($1,$2,$3)',
      [version, name, [sql]]
    )
  }
  const {
    rows: [verified],
  } = await db.query(
    "select to_regprocedure('public.delete_own_message(uuid)') is not null and to_regprocedure('public.pending_storage_cleanup()') is not null as ok"
  )
  if (!verified.ok) throw new Error('Migration verification failed')
  const apply = process.argv.includes('--apply')
  await db.query(apply ? 'commit' : 'rollback')
  console.log(
    applied.rowCount
      ? 'Already applied; verified.'
      : apply
        ? 'Migration applied and recorded.'
        : 'Dry run passed; rolled back.'
  )
  if (process.argv.includes('--audit')) {
    const {
      rows: [storage],
    } = await db.query(`select
      count(*)::int as queued_existing_objects,
      count(*) filter (where not public.storage_object_referenced(o.bucket_id,o.name))::int as queued_unreferenced_objects
      from public.storage_cleanup_queue q join storage.objects o on o.id=q.object_id`)
    console.log({
      ...storage,
      unattendedWorkerKeyConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    })
  }
} catch (error) {
  await db.query('rollback').catch(() => undefined)
  console.error({ message: error.message, code: error.code })
  process.exitCode = 1
} finally {
  await db.end()
}
