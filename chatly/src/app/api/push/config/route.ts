export function GET() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const configured = Boolean(
    publicKey &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.NEXT_PUBLIC_SUPABASE_URL
  )
  return Response.json(
    { configured, publicKey: configured ? publicKey : null },
    {
      headers: { 'Cache-Control': 'no-store' },
    }
  )
}
