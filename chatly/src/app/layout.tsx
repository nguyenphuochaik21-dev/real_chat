import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import { LanguageProvider } from '@/lib/i18n'
import { PwaProvider } from '@/components/pwa-provider'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: {
    default: 'Chatly - Nhắn tin thời gian thực',
    template: '%s | Chatly',
  },
  description: 'Ứng dụng nhắn tin thời gian thực cho bạn bè và nhóm.',
  applicationName: 'Chatly',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Chatly',
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
  colorScheme: 'light dark',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className={`${inter.variable} h-full font-sans antialiased`}>
        <ThemeProvider>
          <LanguageProvider>
            <PwaProvider>{children}</PwaProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
