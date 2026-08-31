import type { Metadata } from 'next'
import { LocalizedText } from '@/components/auth/localized-text'

export const metadata: Metadata = {
  title: 'Chatly - Đăng nhập',
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Left side - Branding */}
      <div className="from-primary-600 via-primary-700 to-primary-900 hidden flex-col justify-between bg-gradient-to-br p-12 lg:flex lg:w-1/2">
        <div>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 backdrop-blur">
            <svg
              className="h-6 w-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <h1 className="mt-8 text-4xl font-bold text-white">
            <LocalizedText translationKey="auth.welcome" />
          </h1>
          <p className="mt-4 text-lg text-white/80">
            <LocalizedText translationKey="auth.tagline" />
          </p>
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-white/80">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <span>
              <LocalizedText translationKey="auth.encrypted" />
            </span>
          </div>
          <div className="flex items-center gap-3 text-white/80">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <span>
              <LocalizedText translationKey="auth.realtime" />
            </span>
          </div>
          <div className="flex items-center gap-3 text-white/80">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <span>
              <LocalizedText translationKey="auth.share" />
            </span>
          </div>
        </div>
      </div>

      {/* Right side - Auth form */}
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  )
}
