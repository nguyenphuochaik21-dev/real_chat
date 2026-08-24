import type { MockStatus } from './types'
import { mockUsers } from './users'

export const mockStatuses: MockStatus[] = [
  {
    id: 'status-1',
    user: mockUsers[0], // Sarah
    media_url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=400&h=600&fit=crop',
    caption: 'Amazing view from the mountains! 🏔️',
    created_at: '2024-03-15T08:00:00Z',
    viewed: true,
    view_count: 24,
  },
  {
    id: 'status-2',
    user: mockUsers[1], // Michael
    media_url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&h=600&fit=crop',
    caption: 'Morning coffee vibes ☕',
    created_at: '2024-03-15T07:30:00Z',
    viewed: false,
    view_count: 12,
  },
  {
    id: 'status-3',
    user: mockUsers[2], // Emma
    media_url: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=400&h=600&fit=crop',
    caption: 'Tokyo nights 🌃',
    created_at: '2024-03-14T22:00:00Z',
    viewed: true,
    view_count: 45,
  },
  {
    id: 'status-4',
    user: mockUsers[5], // Alex
    media_url: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=400&h=600&fit=crop',
    caption: 'Coding session in progress 💻',
    created_at: '2024-03-14T18:00:00Z',
    viewed: false,
    view_count: 8,
  },
  {
    id: 'status-5',
    user: mockUsers[3], // David
    media_url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=600&fit=crop',
    caption: 'Q1 results looking great! 📈',
    created_at: '2024-03-13T16:00:00Z',
    viewed: true,
    view_count: 32,
  },
]

export function getRecentStatuses(): MockStatus[] {
  return mockStatuses.filter((s) => !s.viewed)
}

export function getSeenStatuses(): MockStatus[] {
  return mockStatuses.filter((s) => s.viewed)
}
