# 05 - Server Actions & Route Handlers

> Phase 1 chưa cần. File này là blueprint cho Phase 2+.

## Quy ước

- **Server Actions** (preferred): mutations, form submits, internal calls
- **Route Handlers** (`route.ts`): webhooks, public APIs, file uploads
- **Server Components**: reads (gọi Supabase trực tiếp, không qua action)
- **Realtime**: qua Supabase channels từ client components

## Convention naming

```typescript
// app/actions/conversations.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function createConversation(participantId: string) {
  // ...
  revalidatePath('/chats')
}
```

## Danh sách Server Actions

### Auth (`app/actions/auth.ts`)
- `signUpWithEmail(email, password, displayName)`
- `signInWithEmail(email, password)`
- `signInWithMagicLink(email)`
- `signInWithOAuth(provider: 'google' | 'github')`
- `signOut()`

### Conversations (`app/actions/conversations.ts`)
- `createDirectConversation(otherUserId: string)` → tạo hoặc trả về existing
- `archiveConversation(conversationId: string)`
- `unarchiveConversation(conversationId: string)`
- `pinConversation(conversationId: string)`
- `unpinConversation(conversationId: string)`
- `muteConversation(conversationId: string)`
- `unmuteConversation(conversationId: string)`
- `deleteConversation(conversationId: string)`
- `markAsRead(conversationId: string)`

### Messages (`app/actions/messages.ts`)
- `sendMessage(conversationId: string, content: string, replyTo?: string)`
- `editMessage(messageId: string, content: string)`
- `deleteMessage(messageId: string)`
- `addReaction(messageId: string, emoji: string)`
- `removeReaction(messageId: string, emoji: string)`

### Profile (`app/actions/profile.ts`)
- `updateProfile({ display_name, bio, avatar_url })`
- `updateAvatar(file: File)` — upload Supabase Storage
- `updateStatus(status: UserStatus)`

### Settings (`app/actions/settings.ts`)
- `updateNotificationSettings(prefs)`
- `updateAppearanceSettings({ theme, accent_color, font_size })`
- `updatePrivacySettings(prefs)`

## Route Handlers

### Auth callbacks
- `app/(auth)/callback/route.ts` — handle magic link, OAuth callback

### Realtime token (optional)
- `app/api/realtime/token/route.ts` — cấp token cho client

### Webhooks
- `app/api/webhooks/supabase/route.ts` — handle Postgres webhook

### File upload
- `app/api/upload/route.ts` — upload file to Supabase Storage (alternative to direct upload)

## Validation pattern

```typescript
// lib/validators/conversation.ts
import { z } from 'zod'

export const createConversationSchema = z.object({
  participantId: z.string().uuid(),
})

export const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().min(1).max(4000),
  replyTo: z.string().uuid().optional(),
})

export type CreateConversationInput = z.infer<typeof createConversationSchema>
export type SendMessageInput = z.infer<typeof sendMessageSchema>
```

## Error handling

```typescript
// lib/errors.ts
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 400,
  ) {
    super(message)
  }
}

// Trong action:
try {
  // ...
} catch (e) {
  if (e instanceof AppError) {
    return { error: e.message, code: e.code }
  }
  // Log và throw hoặc return generic error
  console.error(e)
  return { error: 'Something went wrong', code: 'INTERNAL' }
}
```

## Realtime channels

### Pattern: Broadcast cho messages

```typescript
// Client subscribe
const channel = supabase.channel(`room:${conversationId}`)
  .on('broadcast', { event: 'message' }, (payload) => {
    // payload = { message: Message }
    setMessages(prev => [...prev, payload.message])
  })
  .subscribe()

// Cleanup
return () => { supabase.removeChannel(channel) }

// Server broadcast (sau khi insert message)
await supabase.channel(`room:${conversationId}`).send({
  type: 'broadcast',
  event: 'message',
  payload: { message: newMessage }
})
```

### Pattern: Presence cho online status

```typescript
const presenceChannel = supabase.channel('online-users')
  .on('presence', { event: 'sync' }, () => {
    const state = presenceChannel.presenceState()
    // state = { userId: [{ user_id, online_at }] }
  })
  .subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await presenceChannel.track({ user_id: currentUserId, online_at: new Date() })
    }
  })
```
