import nextEnv from '@next/env'
import pg from 'pg'
import { readFile } from 'node:fs/promises'

export async function createDatabaseClient() {
  nextEnv.loadEnvConfig(process.cwd())
  if (!process.env.DIRECT_URL) throw new Error('DIRECT_URL is required')

  let ca
  if (process.env.DATABASE_CA_CERT_PATH) {
    ca = await readFile(process.env.DATABASE_CA_CERT_PATH, 'utf8')
  } else {
    const response = await fetch(
      'https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt',
      { signal: AbortSignal.timeout(10_000) }
    )
    if (!response.ok) throw new Error('Could not load database CA')
    ca = await response.text()
  }

  return new pg.Client({
    connectionString: process.env.DIRECT_URL,
    connectionTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: true, ca },
  })
}
