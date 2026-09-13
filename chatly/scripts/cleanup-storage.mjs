import nextEnv from '@next/env'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'

nextEnv.loadEnvConfig(process.cwd())
if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.DIRECT_URL) {
  throw new Error('Storage maintenance requires DIRECT_URL and SUPABASE_SERVICE_ROLE_KEY')
}
const ca = await fetch(
  'https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt',
  { signal: AbortSignal.timeout(10_000) }
).then((response) => response.text())
const db = new pg.Client({
  connectionString: process.env.DIRECT_URL,
  ssl: { rejectUnauthorized: true, ca },
})
const storage = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
).storage
let removed = 0
let retained = 0
try {
  await db.connect()
  const { rows: jobs } = await db.query(
    "select * from public.storage_cleanup_queue where queued_at < now()-interval '1 hour' order by queued_at limit 50"
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
    } = await db.query(
      `select
      exists(select 1 from public.messages where media_url=$1 or media_thumbnail_url=$1)
      or exists(select 1 from public.scheduled_messages where media_url=$1)
      or exists(select 1 from public.profiles p where position($1 in to_jsonb(p)::text)>0) as referenced`,
      [job.object_name]
    )
    if (referenced) {
      retained++
      await db.query('update public.storage_cleanup_queue set queued_at=now() where object_id=$1', [
        job.object_id,
      ])
      continue
    }
    const bucket = storage.from(job.bucket_id)
    const { data, error: infoError } = await bucket.info(job.object_name)
    if (
      infoError ||
      data.id !== job.object_id ||
      Date.parse(data.lastModified ?? data.updatedAt ?? data.createdAt) > Date.parse(job.queued_at)
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
