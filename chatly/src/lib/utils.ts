import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getCompactDisplayName(name: string, maxWords = 2): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const visibleWords = words.length > maxWords ? words.slice(-maxWords) : words

  return visibleWords
    .map((word) => word.charAt(0).toLocaleUpperCase('vi-VN') + word.slice(1))
    .join(' ')
}

export function formatDistanceToNow(date: Date, locale: 'vi' | 'en' = 'en'): string {
  const now = new Date()
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) {
    return locale === 'vi' ? 'Vừa xong' : 'Just now'
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60)
  if (diffInMinutes < 60) {
    return locale === 'vi' ? `${diffInMinutes} phút trước` : `${diffInMinutes}m ago`
  }

  const diffInHours = Math.floor(diffInMinutes / 60)
  if (diffInHours < 24) {
    return locale === 'vi' ? `${diffInHours} giờ trước` : `${diffInHours}h ago`
  }

  const diffInDays = Math.floor(diffInHours / 24)
  if (diffInDays < 7) {
    return locale === 'vi' ? `${diffInDays} ngày trước` : `${diffInDays}d ago`
  }

  const diffInWeeks = Math.floor(diffInDays / 7)
  if (diffInWeeks < 4) {
    return locale === 'vi' ? `${diffInWeeks} tuần trước` : `${diffInWeeks}w ago`
  }

  // Format as date
  return date.toLocaleDateString(locale === 'vi' ? 'vi-VN' : 'en-US', {
    month: 'short',
    day: 'numeric',
  })
}
