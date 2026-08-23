---
name: chatly-test-fixture
description: Tạo mock data cho test
---

# Chatly Test Fixture Skill

Cung cấp fixture patterns để tạo mock data cho test.

## Khi nào dùng
- Viết unit test cho component dùng mock data
- Tạo storybook stories
- Setup dev environment

## Mock users

```typescript
// lib/mock/users.ts (cũng dùng được cho test)
export const MOCK_USERS = {
  john: {
    id: 'user-john',
    username: 'johndoe',
    display_name: 'John Doe',
    avatar_url: null, // sẽ dùng initial fallback
    bio: 'Hey there! I am using Chatly.',
    phone: '+1 555 123 4567',
    email: 'john@example.com',
    status: 'online',
  } as MockUser,

  sarah: {
    id: 'user-sarah',
    username: 'sarahw',
    display_name: 'Sarah Wilson',
    avatar_url: 'https://i.pravatar.cc/150?img=1',
    bio: 'Living my best life!',
    phone: '+1 555 123 4568',
    email: 'sarah@example.com',
    status: 'online',
    last_seen: '2026-08-22T18:30:00Z',
  } as MockUser,

  // ... thêm user khác
}

export const CURRENT_USER = MOCK_USERS.john
```

## Mock conversations

```typescript
export const MOCK_CONVERSATIONS: MockConversation[] = [
  {
    id: 'conv-1',
    type: 'direct',
    participant: MOCK_USERS.sarah,
    last_message: {
      id: 'msg-last-1',
      conversation_id: 'conv-1',
      sender_id: MOCK_USERS.sarah.id,
      content: 'That sounds amazing! What features are you working on?',
      created_at: '2026-08-22T18:37:00Z',
      status: 'read',
    },
    unread_count: 0,
    is_pinned: false,
    is_muted: false,
    is_archived: false,
  },
  // ...
]
```

## Mock messages

```typescript
export const MOCK_MESSAGES_CONV_1: MockMessage[] = [
  {
    id: 'msg-1',
    conversation_id: 'conv-1',
    sender_id: MOCK_USERS.sarah.id,
    content: 'Hey John! How are you?',
    created_at: '2026-08-22T18:29:00Z',
    status: 'read',
  },
  {
    id: 'msg-2',
    conversation_id: 'conv-1',
    sender_id: MOCK_USERS.john.id,
    content: 'Hi Sarah! I am doing great, thanks for asking!',
    created_at: '2026-08-22T18:30:00Z',
    status: 'read',
  },
  // ...
]
```

## Test fixtures

```typescript
// __tests__/fixtures.ts
export const fixtureUser = (overrides?: Partial<MockUser>): MockUser => ({
  id: 'test-user-id',
  username: 'testuser',
  display_name: 'Test User',
  avatar_url: null,
  bio: '',
  phone: '',
  email: 'test@example.com',
  status: 'online',
  ...overrides,
})

export const fixtureConversation = (
  overrides?: Partial<MockConversation>
): MockConversation => ({
  id: 'test-conv-id',
  type: 'direct',
  participant: fixtureUser({ display_name: 'Other User' }),
  last_message: {
    id: 'test-msg-id',
    conversation_id: 'test-conv-id',
    sender_id: 'other-user-id',
    content: 'Test message',
    created_at: new Date().toISOString(),
    status: 'read',
  },
  unread_count: 0,
  is_pinned: false,
  is_muted: false,
  is_archived: false,
  ...overrides,
})

export const fixtureMessage = (overrides?: Partial<MockMessage>): MockMessage => ({
  id: 'test-message-id',
  conversation_id: 'test-conv-id',
  sender_id: 'test-user-id',
  content: 'Test message',
  created_at: new Date().toISOString(),
  status: 'sent',
  ...overrides,
})
```

## Factory pattern

```typescript
// __tests__/factories.ts
let counter = 0

export const makeUser = (overrides?: Partial<MockUser>): MockUser => ({
  id: `user-${++counter}`,
  username: `user${counter}`,
  display_name: `User ${counter}`,
  avatar_url: null,
  status: 'online',
  ...overrides,
})

export const makeConversation = (
  overrides?: Partial<MockConversation>
): MockConversation => ({
  id: `conv-${++counter}`,
  type: 'direct',
  participant: makeUser(),
  last_message: makeMessage(),
  unread_count: 0,
  is_pinned: false,
  is_muted: false,
  is_archived: false,
  ...overrides,
})

export const makeMessage = (overrides?: Partial<MockMessage>): MockMessage => ({
  id: `msg-${++counter}`,
  conversation_id: 'conv-1',
  sender_id: 'user-1',
  content: `Message ${counter}`,
  created_at: new Date(Date.now() - counter * 1000).toISOString(),
  status: 'sent',
  ...overrides,
})

// Usage:
const users = Array.from({ length: 5 }, () => makeUser())
const conversation = makeConversation({ participant: users[0] })
```

## Mock Supabase client (for testing)

```typescript
// __tests__/mocks/supabase.ts
import { vi } from 'vitest'

export const mockSupabaseClient = {
  auth: {
    getUser: vi.fn(() => ({
      data: { user: { id: 'test-user', email: 'test@example.com' } },
      error: null,
    })),
    signInWithPassword: vi.fn(),
    signOut: vi.fn(),
  },
  from: vi.fn((table: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(() => ({
          data: { id: 'mock-id' },
          error: null,
        })),
      })),
    })),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => ({
          data: { id: 'new-id' },
          error: null,
        })),
      })),
    })),
    update: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({
          data: null,
          error: null,
        })),
      })),
    })),
  })),
  channel: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn(),
    send: vi.fn(() => Promise.resolve()),
    unsubscribe: vi.fn(),
  })),
  removeChannel: vi.fn(),
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => Promise.resolve(mockSupabaseClient)),
}))
```

## Storybook stories (nếu dùng)

```typescript
// MessageBubble.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { MessageBubble } from './MessageBubble'

const meta: Meta<typeof MessageBubble> = {
  component: MessageBubble,
}

export default meta

export const Incoming: StoryObj = {
  args: {
    message: {
      id: '1',
      conversation_id: 'c1',
      sender_id: 'other',
      content: 'Hello there!',
      created_at: new Date().toISOString(),
      status: 'read',
    },
    isOwn: false,
  },
}

export const Outgoing: StoryObj = {
  args: {
    message: {
      id: '2',
      conversation_id: 'c1',
      sender_id: 'me',
      content: 'Hi back!',
      created_at: new Date().toISOString(),
      status: 'delivered',
    },
    isOwn: true,
  },
}
```
