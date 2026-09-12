import type { Metadata } from 'next'
import Link from 'next/link'
import { Image as ImageIcon, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import { LocalizedText } from '@/components/auth/localized-text'
import { ChatlyLogo } from '@/components/brand/chatly-logo'

export const metadata: Metadata = {
  title: 'Chatly - Đăng nhập',
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh overflow-hidden bg-[var(--bg-app)]">
      <section className="from-primary-600 via-primary-700 to-primary-950 relative hidden w-[54%] overflow-hidden bg-gradient-to-br px-12 py-10 text-white lg:flex lg:flex-col xl:px-16 xl:py-12">
        <div
          aria-hidden
          className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-white/10 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute right-[-8rem] bottom-[-9rem] h-[30rem] w-[30rem] rounded-full bg-cyan-300/15 blur-3xl"
        />

        <Link href="/login" className="relative z-10 flex w-fit items-center gap-3">
          <ChatlyLogo className="h-12 w-12 drop-shadow-lg" title="Chatly" />
          <span className="text-2xl font-bold tracking-tight">Chatly</span>
        </Link>

        <div className="relative z-10 my-auto max-w-xl py-12">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-sm text-white/90 backdrop-blur">
            <Sparkles className="h-4 w-4 text-cyan-200" />
            <LocalizedText translationKey="auth.brandEyebrow" />
          </div>
          <h1 className="text-4xl leading-tight font-bold tracking-tight xl:text-5xl xl:leading-[1.1]">
            <LocalizedText translationKey="auth.welcome" />
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-8 text-white/75">
            <LocalizedText translationKey="auth.tagline" />
          </p>

          <div className="mt-10 max-w-md space-y-3" aria-hidden>
            <div className="mr-14 rounded-2xl rounded-bl-md border border-white/15 bg-white/10 p-4 shadow-xl backdrop-blur-md">
              <div className="mb-2 flex items-center gap-2 text-xs text-white/60">
                <span className="h-2 w-2 rounded-full bg-emerald-300" />
                Chatly
              </div>
              <p className="text-sm text-white/90">
                <LocalizedText translationKey="auth.previewMessageOne" />
              </p>
            </div>
            <div className="ml-16 rounded-2xl rounded-br-md bg-white p-4 text-sm font-medium text-violet-950 shadow-xl">
              <LocalizedText translationKey="auth.previewMessageTwo" />
            </div>
          </div>
        </div>

        <div className="relative z-10 grid grid-cols-3 gap-3 text-sm text-white/75">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
            <ShieldCheck className="mb-2 h-5 w-5 text-cyan-200" />
            <LocalizedText translationKey="auth.encrypted" />
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
            <Zap className="mb-2 h-5 w-5 text-cyan-200" />
            <LocalizedText translationKey="auth.realtime" />
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
            <ImageIcon className="mb-2 h-5 w-5 text-cyan-200" />
            <LocalizedText translationKey="auth.share" />
          </div>
        </div>
      </section>

      <section className="relative flex min-w-0 flex-1 items-center justify-center px-4 py-8 sm:px-8 lg:px-10">
        <div
          aria-hidden
          className="bg-primary-500/10 absolute top-[-8rem] right-[-8rem] h-80 w-80 rounded-full blur-3xl lg:hidden"
        />
        <div className="relative z-10 w-full max-w-md">
          <Link href="/login" className="mb-8 flex w-fit items-center gap-2.5 lg:hidden">
            <ChatlyLogo className="h-11 w-11 shadow-md" title="Chatly" />
            <span className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
              Chatly
            </span>
          </Link>
          <div className="rounded-3xl border border-[var(--border-default)] bg-[var(--bg-panel)] p-5 shadow-xl shadow-violet-950/5 sm:p-8">
            {children}
          </div>
        </div>
      </section>
    </main>
  )
}
