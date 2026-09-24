import nextEnv from '@next/env'
import pg from 'pg'
import { readFile } from 'node:fs/promises'

nextEnv.loadEnvConfig(process.cwd())
if (!process.env.DIRECT_URL) throw new Error('DIRECT_URL is required')

const filename = process.argv[2]
if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(filename ?? '')) {
  throw new Error('Provide one exact migration filename from supabase/migrations/')
}
const version = filename.slice(0, 14)
const name = filename.slice(15, -4)
const sql = await readFile(new URL(`../supabase/migrations/${filename}`, import.meta.url), 'utf8')
const caResponse = await fetch(
  'https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt'
)
if (!caResponse.ok) throw new Error('Could not load database CA')
const db = new pg.Client({
  connectionString: process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: true, ca: await caResponse.text() },
})

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
    await db.query(sql)
    await db.query(
      'insert into supabase_migrations.schema_migrations(version,name,statements) values ($1,$2,$3)',
      [version, name, [sql]]
    )
  }
  const commit = process.argv.includes('--apply')
  await db.query(commit ? 'commit' : 'rollback')
  console.log(
    applied.rowCount
      ? 'Migration was already applied.'
      : commit
        ? 'Migration applied and recorded.'
        : 'Migration dry run passed; no changes committed.'
  )
} catch (error) {
  await db.query('rollback').catch(() => undefined)
  console.error({ message: error.message, code: error.code })
  process.exitCode = 1
} finally {
  await db.end()
}
