import nextEnv from '@next/env'
import pg from 'pg'
import { readdir } from 'node:fs/promises'

nextEnv.loadEnvConfig(process.cwd())
if (!process.env.DIRECT_URL) throw new Error('DIRECT_URL is required')

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
  await db.query('begin read only')
  const queries = [
    `
      select relname as table_name, n_live_tup::bigint as estimated_rows,
        seq_scan::bigint, idx_scan::bigint
      from pg_stat_user_tables where schemaname='public'
      order by n_live_tup desc limit 20
    `,
    `
      select table_name, array_agg(index_name order by index_name) as indexes
      from (
        select table_rel.relname as table_name, index_rel.relname as index_name,
          idx.indrelid, idx.indkey::text, idx.indclass::text, idx.indisunique,
          am.amname, coalesce(pg_get_expr(idx.indpred,idx.indrelid),'') as predicate,
          coalesce(pg_get_expr(idx.indexprs,idx.indrelid),'') as expressions
        from pg_index idx
        join pg_class table_rel on table_rel.oid=idx.indrelid
        join pg_namespace ns on ns.oid=table_rel.relnamespace and ns.nspname='public'
        join pg_class index_rel on index_rel.oid=idx.indexrelid
        join pg_am am on am.oid=index_rel.relam
      ) entries
      group by table_name, indrelid, indkey, indclass, indisunique, amname, predicate, expressions
      having count(*)>1
    `,
    `
      select proname as function_name, count(*)::int as overloads
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.prosecdef
        and has_function_privilege('anon',p.oid,'EXECUTE')
      group by proname order by proname
    `,
    'select version from supabase_migrations.schema_migrations',
    `
      select count(*)::int as count from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r' and not c.relrowsecurity
    `,
  ]
  const results = []
  for (const query of queries) results.push(await db.query(query))
  const [tables, indexes, functions, migrations, applied] = results
  const fixtures = await db.query(`
    select count(*)::int as count from storage.objects
    where bucket_id='chat-media'
      and name ~ '/preview-[0-9a-f-]{36}\\.txt$'
  `)
  const cleanup = await db.query(`
    select count(*)::int as queued,
      count(o.id)::int as existing_objects,
      count(o.id) filter (
        where not public.storage_object_referenced(o.bucket_id, o.name)
      )::int as unreferenced_objects
    from public.storage_cleanup_queue q
    left join storage.objects o on o.id=q.object_id
  `)
  const files = await readdir(new URL('../supabase/migrations/', import.meta.url))
  const appliedVersions = new Set(migrations.rows.map((row) => row.version))
  const missing = files
    .filter((file) => file.endsWith('.sql'))
    .map((file) => file.slice(0, 14))
    .filter((version) => !appliedVersions.has(version))

  console.log('Largest tables (estimated rows, sequential/index scans):', tables.rows)
  console.log('Exact duplicate index candidates:', indexes.rows)
  console.log('Anonymous-callable security-definer functions:', functions.rows)
  console.log('Public tables without RLS:', applied.rows[0].count)
  console.log('Local migrations missing from remote history:', missing)
  console.log('Orphaned preview test objects:', fixtures.rows[0].count)
  console.log('Storage cleanup queue:', cleanup.rows[0])
  await db.query('commit')
} catch (error) {
  await db.query('rollback').catch(() => undefined)
  console.error({ message: error.message, code: error.code })
  process.exitCode = 1
} finally {
  await db.end()
}
