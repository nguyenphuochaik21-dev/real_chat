import type { NextConfig } from 'next'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const remotePatterns: NonNullable<NonNullable<NextConfig['images']>['remotePatterns']> = []

if (supabaseUrl) {
  const storageUrl = new URL(supabaseUrl)
  remotePatterns.push({
    protocol: storageUrl.protocol === 'http:' ? 'http' : 'https',
    hostname: storageUrl.hostname,
    port: storageUrl.port,
    pathname: '/storage/v1/object/**',
  })
}

const nextConfig: NextConfig = {
  distDir: process.env.CHATLY_NEXT_DIST_DIR || '.next',
  images: {
    remotePatterns,
    formats: ['image/webp'],
    qualities: [75],
    maximumRedirects: 1,
    maximumResponseBody: 10_000_000,
  },
}

export default nextConfig
