import type { MockConversation, MockMessage } from './types'
import { mockUsers } from './users'
import { mockMessages } from './messages'

const lastMessages = mockMessages.reduce(
  (acc, msg) => {
    if (!acc[msg.conversation_id]) {
      acc[msg.conversation_id] = msg
    } else {
      const existing = acc[msg.conversation_id]
      if (new Date(msg.created_at) > new Date(existing.created_at)) {
        acc[msg.conversation_id] = msg
      }
    }
    return acc
  },
  {} as Record<string, MockMessage>
)

export const mockConversations: MockConversation[] = [
  {
    id: 'conv-1',
    type: 'direct',
    participant: mockUsers[0], // Sarah
    last_message: lastMessages['conv-1'] || {
      id: 'msg-30',
      conversation_id: 'conv-1',
      sender_id: 'user-1',
      content: 'Oh wow, this looks incredible!',
      created_at: '2024-03-15T09:35:00Z',
      status: 'read',
    },
    unread_count: 0,
    is_pinned: true,
    is_muted: false,
    is_archived: false,
  },
  {
    id: 'conv-2',
    type: 'direct',
    participant: mockUsers[1], // Michael
    last_message: lastMessages['conv-2'] || {
      id: 'msg-9',
      conversation_id: 'conv-2',
      sender_id: 'user-2',
      content: 'Sounds good! Thai or Italian?',
      created_at: '2024-03-14T14:08:00Z',
      status: 'read',
    },
    unread_count: 0,
    is_pinned: false,
    is_muted: false,
    is_archived: false,
  },
  {
    id: 'conv-3',
    type: 'direct',
    participant: mockUsers[2], // Emma
    last_message: lastMessages['conv-3'] || {
      id: 'msg-12',
      conversation_id: 'conv-3',
      sender_id: 'user-3',
      content: 'I made the changes you suggested.',
      created_at: '2024-03-14T11:30:00Z',
      status: 'read',
    },
    unread_count: 0,
    is_pinned: false,
    is_muted: false,
    is_archived: false,
  },
  {
    id: 'conv-4',
    type: 'direct',
    participant: mockUsers[3], // David
    last_message: lastMessages['conv-4'] || {
      id: 'msg-16',
      conversation_id: 'conv-4',
      sender_id: 'user-4',
      content: "That's fantastic news! 🎉",
      created_at: '2024-03-13T16:06:00Z',
      status: 'read',
    },
    unread_count: 2,
    is_pinned: true,
    is_muted: false,
    is_archived: false,
  },
  {
    id: 'conv-5',
    type: 'direct',
    participant: mockUsers[4], // Lisa
    last_message: lastMessages['conv-5'] || {
      id: 'msg-19',
      conversation_id: 'conv-5',
      sender_id: 'user-5',
      content: "Let's catch a movie!",
      created_at: '2024-03-12T19:35:00Z',
      status: 'read',
    },
    unread_count: 0,
    is_pinned: false,
    is_muted: true,
    is_archived: false,
  },
  {
    id: 'conv-6',
    type: 'direct',
    participant: mockUsers[5], // Alex
    last_message: lastMessages['conv-6'] || {
      id: 'msg-22',
      conversation_id: 'conv-6',
      sender_id: 'user-6',
      content: 'Framer Motion + some custom CSS.',
      created_at: '2024-03-11T13:15:00Z',
      status: 'read',
    },
    unread_count: 0,
    is_pinned: false,
    is_muted: false,
    is_archived: false,
  },
  {
    id: 'conv-7',
    type: 'direct',
    participant: mockUsers[6], // Maria
    last_message: lastMessages['conv-7'] || {
      id: 'msg-25',
      conversation_id: 'conv-7',
      sender_id: 'user-7',
      content: '92.4% on the test set.',
      created_at: '2024-03-10T10:08:00Z',
      status: 'read',
    },
    unread_count: 1,
    is_pinned: false,
    is_muted: false,
    is_archived: false,
  },
  {
    id: 'conv-8',
    type: 'direct',
    participant: mockUsers[7], // James
    last_message: lastMessages['conv-8'] || {
      id: 'msg-28',
      conversation_id: 'conv-8',
      sender_id: 'user-8',
      content: 'It was a Docker configuration issue.',
      created_at: '2024-03-09T15:10:00Z',
      status: 'read',
    },
    unread_count: 0,
    is_pinned: false,
    is_muted: false,
    is_archived: false,
  },
]

export function getConversationById(id: string): MockConversation | undefined {
  return mockConversations.find((c) => c.id === id)
}

export function getConversationsByUserId(userId: string): MockConversation[] {
  return mockConversations.filter((c) => c.participant.id === userId)
}
