import type { MockCall } from './types'
import { mockUsers } from './users'

export const mockCalls: MockCall[] = [
  {
    id: 'call-1',
    participant: mockUsers[1], // Michael
    type: 'voice',
    direction: 'incoming',
    started_at: '2024-03-15T10:00:00Z',
    duration_seconds: 245,
  },
  {
    id: 'call-2',
    participant: mockUsers[3], // David
    type: 'video',
    direction: 'outgoing',
    started_at: '2024-03-14T16:00:00Z',
    duration_seconds: 1800,
  },
  {
    id: 'call-3',
    participant: mockUsers[5], // Alex
    type: 'voice',
    direction: 'missed',
    started_at: '2024-03-14T09:30:00Z',
  },
  {
    id: 'call-4',
    participant: mockUsers[0], // Sarah
    type: 'video',
    direction: 'incoming',
    started_at: '2024-03-13T14:00:00Z',
    duration_seconds: 900,
  },
  {
    id: 'call-5',
    participant: mockUsers[6], // Maria
    type: 'voice',
    direction: 'outgoing',
    started_at: '2024-03-12T11:00:00Z',
    duration_seconds: 420,
  },
  {
    id: 'call-6',
    participant: mockUsers[2], // Emma
    type: 'voice',
    direction: 'missed',
    started_at: '2024-03-11T20:00:00Z',
  },
  {
    id: 'call-7',
    participant: mockUsers[7], // James
    type: 'voice',
    direction: 'incoming',
    started_at: '2024-03-10T15:30:00Z',
    duration_seconds: 600,
  },
  {
    id: 'call-8',
    participant: mockUsers[8], // Sophia
    type: 'video',
    direction: 'missed',
    started_at: '2024-03-09T09:00:00Z',
  },
]

export function getCallsByDirection(direction: MockCall['direction']): MockCall[] {
  return mockCalls.filter((c) => c.direction === direction)
}

export function formatCallDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins >= 60) {
    const hours = Math.floor(mins / 60)
    const remainingMins = mins % 60
    return `${hours}h ${remainingMins}m`
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
