import type { MockUser } from './types'

export const mockUsers: MockUser[] = [
  {
    id: 'user-1',
    username: 'sarah',
    display_name: 'Sarah Wilson',
    avatar_url:
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=face',
    bio: 'Digital designer & coffee enthusiast',
    phone: '+1 555-0101',
    email: 'sarah@example.com',
    status: 'online',
  },
  {
    id: 'user-2',
    username: 'michael',
    display_name: 'Michael Chen',
    avatar_url:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face',
    bio: 'Software engineer at TechCorp',
    phone: '+1 555-0102',
    email: 'michael@example.com',
    status: 'online',
  },
  {
    id: 'user-3',
    username: 'emma',
    display_name: 'Emma Johnson',
    avatar_url:
      'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face',
    bio: 'Marketing manager',
    phone: '+1 555-0103',
    email: 'emma@example.com',
    status: 'away',
  },
  {
    id: 'user-4',
    username: 'david',
    display_name: 'David Kim',
    avatar_url:
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=face',
    bio: 'Product manager',
    phone: '+1 555-0104',
    email: 'david@example.com',
    status: 'busy',
  },
  {
    id: 'user-5',
    username: 'lisa',
    display_name: 'Lisa Anderson',
    avatar_url:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face',
    bio: 'UX researcher',
    phone: '+1 555-0105',
    email: 'lisa@example.com',
    status: 'offline',
    last_seen: '2024-03-15T10:30:00Z',
  },
  {
    id: 'user-6',
    username: 'alex',
    display_name: 'Alex Rivera',
    avatar_url:
      'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face',
    bio: 'Full-stack developer',
    phone: '+1 555-0106',
    email: 'alex@example.com',
    status: 'online',
  },
  {
    id: 'user-7',
    username: 'maria',
    display_name: 'Maria Garcia',
    avatar_url:
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&h=150&fit=crop&crop=face',
    bio: 'Data scientist',
    phone: '+1 555-0107',
    email: 'maria@example.com',
    status: 'offline',
    last_seen: '2024-03-15T08:15:00Z',
  },
  {
    id: 'user-8',
    username: 'james',
    display_name: 'James Thompson',
    avatar_url:
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&h=150&fit=crop&crop=face',
    bio: 'DevOps engineer',
    phone: '+1 555-0108',
    email: 'james@example.com',
    status: 'away',
  },
  {
    id: 'user-9',
    username: 'sophia',
    display_name: 'Sophia Lee',
    avatar_url:
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&h=150&fit=crop&crop=face',
    bio: 'Frontend developer',
    phone: '+1 555-0109',
    email: 'sophia@example.com',
    status: 'online',
  },
  {
    id: 'user-10',
    username: 'daniel',
    display_name: 'Daniel Brown',
    avatar_url:
      'https://images.unsplash.com/photo-1463453091185-61582044d556?w=150&h=150&fit=crop&crop=face',
    bio: 'Backend developer',
    phone: '+1 555-0110',
    email: 'daniel@example.com',
    status: 'busy',
  },
]

export const currentUser: MockUser = {
  id: 'current-user',
  username: 'john',
  display_name: 'John Doe',
  avatar_url:
    'https://images.unsplash.com/photo-1599566150163-29194dcabd36?w=150&h=150&fit=crop&crop=face',
  bio: 'Building cool stuff',
  phone: '+1 555-0000',
  email: 'john@example.com',
  status: 'online',
}

export function getUserById(id: string): MockUser | undefined {
  if (id === 'current-user') return currentUser
  return mockUsers.find((u) => u.id === id)
}
