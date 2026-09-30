'use client'

import { ErrorRecovery, type ErrorRecoveryProps } from '@/components/error-recovery'
import './globals.css'

export default function GlobalError(props: ErrorRecoveryProps) {
  return (
    <html lang="vi">
      <body>
        <ErrorRecovery {...props} />
      </body>
    </html>
  )
}
