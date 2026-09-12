import type { SVGProps } from 'react'

interface ChatlyLogoProps extends SVGProps<SVGSVGElement> {
  title?: string
}

export function ChatlyLogo({ title, ...props }: ChatlyLogoProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title && <title>{title}</title>}
      <rect width="64" height="64" rx="17" fill="#6d28d9" />
      <path d="M64 26v38H20C39 55 53 42 64 26Z" fill="#4338ca" opacity="0.72" />
      <circle cx="15" cy="12" r="15" fill="#fff" opacity="0.08" />
      <path
        d="M17.5 15.5h29A8.5 8.5 0 0 1 55 24v15a8.5 8.5 0 0 1-8.5 8.5H33.4L22 55l2.3-7.5h-6.8A8.5 8.5 0 0 1 9 39V24a8.5 8.5 0 0 1 8.5-8.5Z"
        fill="#fff"
      />
      <path
        d="M21 33.5c3.1-5.7 7.2-5.7 10.3 0s7.2 5.7 11.7 0"
        fill="none"
        stroke="#22d3ee"
        strokeLinecap="round"
        strokeWidth="4.5"
      />
      <circle cx="21" cy="33.5" r="3.2" fill="#6d28d9" />
      <circle cx="43" cy="33.5" r="3.2" fill="#4338ca" />
    </svg>
  )
}
