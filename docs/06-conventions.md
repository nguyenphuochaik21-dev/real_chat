# 06 - Coding Conventions

## TypeScript

- **Strict mode** in `tsconfig.json`
- Không dùng `any`. Dùng `unknown` rồi narrow, hoặc generic
- Prefer `type` cho object shapes, `interface` cho extendable contracts
- Dùng `as const` cho literal arrays
- Đặt tên type: `User`, `Message`, `Conversation` (PascalCase, số ít)

## File naming

- Component: `PascalCase.tsx` (vd: `MessageBubble.tsx`)
- Hook: `camelCase.ts` với prefix `use` (vd: `useRealtimeMessages.ts`)
- Util: `camelCase.ts` (vd: `formatTime.ts`)
- Type-only file: `types.ts` hoặc `index.ts`
- Constants: `camelCase.ts` (vd: `mockData.ts`) hoặc `constants.ts`

## Folder structure rule

```
components/
  chat/
    MessageBubble.tsx       # Component
    ChatInput.tsx
    useChatScroll.ts        # Hook liên quan
    message-utils.ts        # Helpers
    types.ts                # Types riêng
```

Mỗi feature có folder riêng, chứa component + hook + util + types.

## Component conventions

```typescript
// Component có displayName, props type riêng, default export chỉ khi cần
'use client' // chỉ khi cần

import { type FC } from 'react'

interface MessageBubbleProps {
  message: Message
  isOwn: boolean
  showAvatar?: boolean
}

export const MessageBubble: FC<MessageBubbleProps> = ({
  message,
  isOwn,
  showAvatar = true,
}) => {
  return (
    <div className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
      {/* ... */}
    </div>
  )
}
```

## Import order

```typescript
// 1. React/Next
import { useState } from 'react'
import { useRouter } from 'next/navigation'

// 2. Third-party libraries
import { z } from 'zod'
import { MessageSquare } from 'lucide-react'

// 3. Internal: lib, hooks, components
import { cn } from '@/lib/utils'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { Button } from '@/components/ui/button'

// 4. Types
import type { Message } from '@/types'

// 5. Styles (cuối cùng, nếu có)
import styles from './styles.module.css'
```

## Tailwind conventions

- Dùng utility classes, không viết CSS thuần trừ animations global
- Dùng `cn()` helper để merge conditional classes
- Tránh inline styles, dùng `style` prop chỉ khi dynamic value từ JS

```typescript
import { cn } from '@/lib/utils'

className={cn(
  'base-classes',
  isActive && 'active-classes',
  variant === 'primary' ? 'bg-primary-500' : 'bg-gray-500',
)}
```

## State management

- **Server state**: qua Supabase queries hoặc Server Components
- **Client state**: React useState/useReducer cho local
- **Cross-component state**: Zustand store
- **URL state**: searchParams cho filters, active item
- **Form state**: react-hook-form

## Naming

| Concept | Convention | Example |
|---------|-----------|---------|
| Component | PascalCase | `MessageBubble` |
| Hook | camelCase, prefix `use` | `useRealtimeMessages` |
| Function | camelCase | `formatTime` |
| Constant | UPPER_SNAKE | `MAX_MESSAGE_LENGTH` |
| Boolean var | prefix `is/has/should` | `isActive`, `hasUnread` |
| Event handler | prefix `handle` | `handleClick`, `handleSend` |
| Async function | verb | `fetchUser`, `sendMessage` |
| Type | PascalCase | `Message`, `UserStatus` |
| Enum value | UPPER_SNAKE | `MessageStatus.READ` |

## Comments

- **KHÔNG** comment cái gì code làm
- **CÓ** comment tại sao làm, khi logic phức tạp
- Dùng `// TODO:` cho known improvements
- Dùng `// FIXME:` cho known bugs
- Dùng `// HACK:` cho workaround tạm thời

```typescript
// ❌ Bad
// Increment counter
counter++

// ✅ Good
// Skip the current user's own message — they already see it optimistically
if (message.sender_id === currentUser.id) return
```

## Error handling

- Server Components: throw → caught by `error.tsx`
- Client Components: try/catch + show toast/error state
- Server Actions: return `{ data, error }` shape
- Async hooks: throw → caught by ErrorBoundary hoặc React Query

## Accessibility

- Mọi interactive element có accessible name (label hoặc aria-label)
- Focus visible (Tailwind: `focus-visible:ring-2`)
- Keyboard navigation: tab, enter, escape
- ARIA labels cho icon-only buttons
- Color contrast đạt WCAG AA

## Testing (Phase 2+)

- **Unit test**: Vitest cho utils, hooks
- **Component test**: Vitest + Testing Library
- **E2E test**: Playwright cho user flows
- **File structure**: `*.test.ts` cạnh file gốc, hoặc `__tests__/` cho lớn
