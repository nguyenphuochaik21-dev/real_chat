---
name: chatly-component-pattern
description: Recipe tạo component chuẩn Chatly
---

# Chatly Component Pattern

Recipe chuẩn để tạo component mới cho dự án Chatly.

## Khi nào dùng
- Tạo component mới
- User hỏi về cách tổ chức component

## Quy trình

### 1. Quyết định Server hay Client Component

Mặc định **Server Component**. Chuyển sang Client chỉ khi:
- Dùng `useState`, `useEffect`, hooks khác
- Dùng browser APIs (window, localStorage, ...)
- Dùng event handlers (`onClick`, `onChange`)
- Dùng context providers (theme, auth)
- Dùng third-party libraries yêu cầu client (framer-motion, ...)

### 2. Đặt file đúng chỗ

- Component generic UI (Button, Avatar, ...) → `components/ui/`
- Component feature-specific → `components/<feature>/`
- Page → `app/<route>/page.tsx`
- Layout → `app/<route>/layout.tsx`
- Server Action → `app/actions/<domain>.ts`

### 3. Template cơ bản

```typescript
// components/chat/MessageBubble.tsx
import { cn } from '@/lib/utils'
import { formatTime } from '@/lib/format'
import type { Message } from '@/types'

interface MessageBubbleProps {
  message: Message
  isOwn: boolean
  showAvatar?: boolean
}

export function MessageBubble({
  message,
  isOwn,
  showAvatar = true,
}: MessageBubbleProps) {
  return (
    <div
      className={cn(
        'flex',
        isOwn ? 'justify-end' : 'justify-start',
        'gap-2 mb-2',
      )}
    >
      {!isOwn && showAvatar && (
        <Avatar name={message.sender_name} size="sm" />
      )}
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-4 py-2',
          isOwn
            ? 'bg-primary-500 text-white rounded-br-md'
            : 'bg-white dark:bg-slate-700 rounded-bl-md',
        )}
      >
        <p className="text-sm">{message.content}</p>
        <span
          className={cn(
            'text-xs mt-1 block',
            isOwn ? 'text-white/70' : 'text-gray-500 dark:text-gray-400',
          )}
        >
          {formatTime(message.created_at)}
          {isOwn && <MessageStatusIcon status={message.status} />}
        </span>
      </div>
    </div>
  )
}
```

### 4. Pattern cho Client Component

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'

interface ChatInputProps {
  conversationId: string
  onSend?: (content: string) => void
}

export function ChatInput({ conversationId, onSend }: ChatInputProps) {
  const [content, setContent] = useState('')
  const router = useRouter()

  const handleSend = async () => {
    if (!content.trim()) return
    await sendMessage(conversationId, content)
    setContent('')
    router.refresh() // hoặc optimistic update
    onSend?.(content)
  }

  return (
    <div className="flex items-center gap-2 p-3 border-t">
      <input
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        placeholder="Type a message..."
        className="flex-1 rounded-lg border px-4 py-2 bg-transparent"
      />
      <button
        onClick={handleSend}
        disabled={!content.trim()}
        className="bg-primary-500 text-white p-2 rounded-lg disabled:opacity-50"
      >
        <Send size={20} />
      </button>
    </div>
  )
}
```

### 5. Composition pattern

Tách component lớn thành nhiều component nhỏ:

```typescript
// ✅ Good - composition
<ChatView>
  <ChatHeader user={user} actions={...} />
  <MessageList messages={messages}>
    {(message) => <MessageBubble key={message.id} message={message} />}
  </MessageList>
  <ChatInput conversationId={id} />
</ChatView>

// ❌ Bad - monolithic
<ChatView user={user} messages={messages} onSend={...} />
```

### 6. Naming

- Props: `<ComponentName>Props`
- Event handlers: `handle<Action>` trong component, `on<Action>` ở prop
- State: `<descriptive>` (vd: `isOpen`, `draft`, `messages`)
- Boolean: `is/has/should/can` prefix

### 7. Type safety

```typescript
// ✅ Strict types
interface Props {
  user: User | null
  loading: boolean
  onSelect: (id: string) => void
}

// ❌ Loose types
interface Props {
  user?: any
  onSelect?: Function
}
```

## Anti-patterns cần tránh

- ❌ 'use client' không cần thiết
- ❌ Prop drilling quá 3 levels (dùng context hoặc zustand)
- ❌ Effect không có dependency array đúng
- ❌ State không ở đúng level
- ❌ Inline styles
- ❌ Class names thủ công thay vì cn()
- ❌ Magic strings/numbers (dùng constants)
