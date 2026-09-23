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
const version = '20260924020000'
const sql = await readFile(
  new URL('../supabase/migrations/20260924020000_media_office_types.sql', import.meta.url),
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
      [version, 'media_office_types', [sql]]
    )
  }
  const check = await db.query(
    "select allowed_mime_types @> array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv']::text[] as allowed from storage.buckets where id='chat-media'"
  )
  if (!check.rows[0]?.allowed) throw new Error('Office media type verification failed')
  await db.query('commit')
  console.log(
    applied.rowCount
      ? 'Office media types already allowed.'
      : 'Office media types applied and recorded.'
  )
} catch (error) {
  await db.query('rollback').catch(() => undefined)
  console.error({ message: error.message, code: error.code })
  process.exitCode = 1
} finally {
  await db.end()
}
