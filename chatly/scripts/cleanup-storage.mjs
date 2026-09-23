import nextEnv from '@next/env'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'

nextEnv.loadEnvConfig(process.cwd())
const keyFromStdin = process.argv.includes('--key-stdin')
  ? await new Promise((resolve, reject) => {
      let input = ''
      process.stdin.setEncoding('utf8')
      process.stdin.on('data', (chunk) => {
        input += chunk
        if (input.length > 256) reject(new Error('Invalid key input'))
        if (input.includes('\n')) resolve(input.trim())
      })
      process.stdin.on('end', () => reject(new Error('Key input missing')))
    })
  : undefined
const secretKey =
  keyFromStdin || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!secretKey || !process.env.DIRECT_URL) {
  throw new Error('Storage maintenance requires DIRECT_URL and a server-only Supabase secret key')
}
const ca = await fetch(
  'https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt',
  { signal: AbortSignal.timeout(10_000) }
).then((response) => response.text())
const db = new pg.Client({
  connectionString: process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: true, ca },
})
const storage = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
}).storage
let removed = 0
let retained = 0
try {
  await db.connect()
  const cutoff = process.argv.includes('--now') ? 'now()' : "now()-interval '1 hour'"
  const { rows: jobs } = await db.query(
    `select * from public.storage_cleanup_queue where queued_at < ${cutoff} order by queued_at limit 50`
  )
  for (const job of jobs) {
    // Confirm the exact queued object still exists and has no live references, including forwards.
    const {
      rows: [object],
    } = await db.query('select id from storage.objects where id=$1 and bucket_id=$2 and name=$3', [
      job.object_id,
      job.bucket_id,
      job.object_name,
    ])
    if (!object) {
      await db.query('delete from public.storage_cleanup_queue where object_id=$1', [job.object_id])
      continue
    }
    const {
      rows: [{ referenced }],
    } = await db.query('select public.storage_object_referenced($1, $2) as referenced', [
      job.bucket_id,
      job.object_name,
    ])
    if (referenced) {
      retained++
      await db.query('update public.storage_cleanup_queue set queued_at=now() where object_id=$1', [
        job.object_id,
      ])
      continue
    }
    const bucket = storage.from(job.bucket_id)
    const { data, error: infoError } = await bucket.info(job.object_name)
    const modifiedAt = Date.parse(data?.lastModified ?? data?.updatedAt ?? data?.createdAt ?? '')
    if (
      infoError ||
      data?.id !== job.object_id ||
      !Number.isFinite(modifiedAt) ||
      modifiedAt > Date.parse(job.queued_at)
    ) {
      retained++
      await db.query('update public.storage_cleanup_queue set queued_at=now() where object_id=$1', [
        job.object_id,
      ])
      continue
    }
    const { error } = await bucket.remove([job.object_name])
    if (error) {
      retained++
      await db.query('update public.storage_cleanup_queue set queued_at=now() where object_id=$1', [
        job.object_id,
      ])
      continue
    }
    await db.query('delete from public.storage_cleanup_queue where object_id=$1', [job.object_id])
    removed++
  }
  console.log({ removed, retained, limit: 50 })
} finally {
  await db.end()
}
