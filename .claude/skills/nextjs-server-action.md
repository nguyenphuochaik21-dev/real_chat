---
name: nextjs-server-action
description: Recipe viết Server Action đúng chuẩn Next.js 16
---

# Next.js Server Action Pattern

Khi viết Server Action cho dự án Chatly, dùng pattern này để đảm bảo đúng chuẩn và an toàn.

## Khi nào dùng
- Tạo mutation (create/update/delete)
- Form submit
- Gọi API nội bộ từ Client Component

## Quy trình

### 1. Template cơ bản

```typescript
// app/actions/messages.ts
'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { sendMessageSchema } from '@/lib/validators/messages'

export type ActionResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string }

export async function sendMessage(
  conversationId: string,
  content: string,
  replyTo?: string
): Promise<ActionResult<{ id: string }>> {
  // 1. Validate input
  const parsed = sendMessageSchema.safeParse({
    conversationId,
    content,
    replyTo,
  })

  if (!parsed.success) {
    return {
      success: false,
      error: 'Invalid input',
      code: 'VALIDATION_ERROR',
    }
  }

  // 2. Auth check
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' }
  }

  // 3. Business logic + DB write
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      content: parsed.data.content,
      reply_to: parsed.data.replyTo ?? null,
    })
    .select()
    .single()

  if (error) {
    console.error('sendMessage error:', error)
    return { success: false, error: 'Failed to send message', code: 'DB_ERROR' }
  }

  // 4. Cache invalidation
  revalidatePath(`/chats/${conversationId}`)

  // 5. Realtime broadcast (Phase 3+)
  // await supabase.channel(`room:${conversationId}`).send({
  //   type: 'broadcast',
  //   event: 'message',
  //   payload: { message: data }
  // })

  return { success: true, data: { id: data.id } }
}
```

### 2. Validation với Zod

```typescript
// lib/validators/messages.ts
import { z } from 'zod'

export const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().min(1, 'Message cannot be empty').max(4000),
  replyTo: z.string().uuid().optional(),
})

export type SendMessageInput = z.infer<typeof sendMessageSchema>
```

### 3. Dùng trong Client Component

```typescript
'use client'

import { useState, useTransition } from 'react'
import { sendMessage } from '@/app/actions/messages'

export function ChatInput({ conversationId }: { conversationId: string }) {
  const [content, setContent] = useState('')
  const [isPending, startTransition] = useTransition()

  const handleSend = () => {
    if (!content.trim()) return

    startTransition(async () => {
      const result = await sendMessage(conversationId, content)
      if (result.success) {
        setContent('')
        // Optimistic UI đã được handle bởi realtime subscription
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div>
      <input value={content} onChange={(e) => setContent(e.target.value)} />
      <button onClick={handleSend} disabled={isPending || !content.trim()}>
        Send
      </button>
    </div>
  )
}
```

### 4. Dùng với Form (useActionState)

```typescript
'use client'

import { useActionState } from 'react'
import { createConversation } from '@/app/actions/conversations'

const initialState = { error: '' }

export function NewConversationForm() {
  const [state, formAction, isPending] = useActionState(
    createConversation,
    initialState
  )

  return (
    <form action={formAction}>
      <input name="userId" required />
      {state.error && <p className="text-red-500">{state.error}</p>}
      <button disabled={isPending}>Start chat</button>
    </form>
  )
}
```

### 5. Server Action cho form

```typescript
'use server'

export async function createConversation(
  prevState: { error: string },
  formData: FormData
): Promise<{ error: string }> {
  const userId = formData.get('userId') as string

  // ... validation, auth, DB ...

  if (error) return { error: 'Failed to create' }

  revalidatePath('/chats')
  redirect(`/chats/${conversationId}`)
}
```

### 6. Best practices

#### ✅ DO:
- **Luôn validate input** với Zod
- **Luôn check auth** đầu action
- **Return `ActionResult` shape** `{ success, data, error }`
- **Revalidate path/tag** sau khi mutate
- **Log error** server-side, return generic error cho client
- **Dùng `revalidatePath`** cho trang bị ảnh hưởng
- **Dùng `revalidateTag`** cho data caching theo tag

#### ❌ DON'T:
- Đừng tin tưởng input từ client
- Đừng expose error chi tiết (lộ schema, security issue)
- Đừng quên auth check
- Đừng gọi Server Action trong Server Component (gọi trực tiếp function)
- Đừng `redirect()` rồi `return` (throw hoặc return)

### 7. Cache invalidation strategy

```typescript
// Revalidate specific page
revalidatePath(`/chats/${conversationId}`)
revalidatePath('/chats')  // conversations list

// Revalidate by tag
revalidateTag(`conversation:${conversationId}`)
revalidateTag('user:conversations')
```

Set tag khi fetch:
```typescript
const { data } = await supabase
  .from('messages')
  .select('*')
  .eq('conversation_id', id)
  // unstable_cache wrap with tags
```

### 8. Error handling

```typescript
// lib/errors.ts
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400
  ) {
    super(message)
    this.name = 'AppError'
  }
}

// Trong action:
try {
  // logic
  if (!allowed) throw new AppError('FORBIDDEN', 'Not allowed', 403)
} catch (e) {
  if (e instanceof AppError) {
    return { success: false, error: e.message, code: e.code }
  }
  console.error('Unexpected error:', e)
  return { success: false, error: 'Internal error', code: 'INTERNAL' }
}
```

### 9. Authorization (beyond auth)

Auth check (đã đăng nhập) ≠ Authorization (có quyền làm hành động này).

```typescript
// Check auth
const { data: { user } } = await supabase.auth.getUser()
if (!user) return { success: false, error: 'Unauthorized' }

// Check authorization (vd: có phải participant không)
const { data: participant } = await supabase
  .from('conversation_participants')
  .select('user_id')
  .eq('conversation_id', conversationId)
  .eq('user_id', user.id)
  .single()

if (!participant) {
  return { success: false, error: 'Forbidden', code: 'FORBIDDEN' }
}

// Hoặc tin tưởng RLS:
// RLS sẽ tự reject nếu không có quyền
// nhưng nên check explicit để return error message rõ ràng
```

### 10. Testing

```typescript
// __tests__/actions/sendMessage.test.ts
import { sendMessage } from '@/app/actions/messages'
import { createClient } from '@/lib/supabase/server'

vi.mock('@/lib/supabase/server')

describe('sendMessage', () => {
  it('returns error when not authenticated', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: () => ({ data: { user: null }, error: null }) },
      // ...
    } as any)

    const result = await sendMessage('conv-id', 'Hello')
    expect(result.success).toBe(false)
    expect(result.code).toBe('UNAUTHORIZED')
  })

  it('returns error for invalid input', async () => {
    const result = await sendMessage('not-uuid', '')
    expect(result.success).toBe(false)
    expect(result.code).toBe('VALIDATION_ERROR')
  })

  it('inserts message and returns id', async () => {
    // mock auth + insert
    const result = await sendMessage(validConvId, 'Hello')
    expect(result.success).toBe(true)
    expect(result.data.id).toBeDefined()
  })
})
```
