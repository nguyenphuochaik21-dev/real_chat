import type { NextConfig } from 'next'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const remotePatterns: NonNullable<NonNullable<NextConfig['images']>['remotePatterns']> = []
const trustedImageOrigins = ['https://lh3.googleusercontent.com']
let supabaseOrigin: string | null = null
let supabaseWebSocketOrigin: string | null = null

if (supabaseUrl) {
  try {
    const storageUrl = new URL(supabaseUrl)
    supabaseOrigin = storageUrl.origin
    supabaseWebSocketOrigin = `${storageUrl.protocol === 'http:' ? 'ws:' : 'wss:'}//${storageUrl.host}`
    remotePatterns.push({
      protocol: storageUrl.protocol === 'http:' ? 'http' : 'https',
      hostname: storageUrl.hostname,
      port: storageUrl.port,
      pathname: '/storage/v1/object/**',
    })
  } catch {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL must be a valid URL')
  }
}

remotePatterns.push({
  protocol: 'https',
  hostname: 'lh3.googleusercontent.com',
  pathname: '/**',
})

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${trustedImageOrigins.join(' ')}${supabaseOrigin ? ` ${supabaseOrigin}` : ''}`,
  `media-src 'self' blob:${supabaseOrigin ? ` ${supabaseOrigin}` : ''}`,
  `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin}` : ''}${supabaseWebSocketOrigin ? ` ${supabaseWebSocketOrigin}` : ''}`,
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(process.env.NODE_ENV === 'production' ? ['upgrade-insecure-requests'] : []),
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
]

const nextConfig: NextConfig = {
  distDir: process.env.CHATLY_NEXT_DIST_DIR || '.next',
  poweredByHeader: false,
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
  images: {
    remotePatterns,
    formats: ['image/webp'],
    qualities: [75],
    maximumRedirects: 1,
    maximumResponseBody: 10_000_000,
  },
}

export default nextConfig
