# Phase 4.4 - Message Features Implementation Plan

## Context

Phase 4.4 thêm các tính năng nâng cao cho message: reply, edit, delete, forward, reactions, và starred messages. Database đã có sẵn `reply_to`, `edited_at`, `deleted_at` fields - chỉ cần thêm UI và server actions. Reactions và starred messages cần tạo bảng mới.

---

## Database Migrations

### 1. Reactions Table
**File:** `supabase/migrations/20250101000017_add_reactions_support.sql`

```sql
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_id, emoji)
);

CREATE INDEX idx_reactions_message ON public.message_reactions(message_id);
CREATE INDEX idx_reactions_user ON public.message_reactions(user_id);

-- RLS: Participants can view reactions
CREATE POLICY "Participants can view reactions" ON public.message_reactions
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.messages m
      JOIN public.conversation_participants cp ON m.conversation_id = cp.conversation_id
      WHERE m.id = message_reactions.message_id AND cp.user_id = auth.uid())
  );

-- RLS: Users can add reactions
CREATE POLICY "Users can add reactions" ON public.message_reactions
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.messages m
      JOIN public.conversation_participants cp ON m.conversation_id = cp.conversation_id
      WHERE m.id = message_id AND cp.user_id = auth.uid())
  );

-- RLS: Users can delete own reactions
CREATE POLICY "Users can delete own reactions" ON public.message_reactions
  FOR DELETE TO authenticated USING (user_id = auth.uid());
```

### 2. Starred Messages Table
**File:** `supabase/migrations/20250101000018_add_starred_messages.sql`

```sql
CREATE TABLE IF NOT EXISTS public.starred_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_id)
);

CREATE INDEX idx_starred_user ON public.starred_messages(user_id);

-- RLS: Users can view own starred messages
CREATE POLICY "Users can view own starred messages" ON public.starred_messages
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- RLS: Users can star messages in their conversations
CREATE POLICY "Users can star messages" ON public.starred_messages
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.messages m
      JOIN public.conversation_participants cp ON m.conversation_id = cp.conversation_id
      WHERE m.id = message_id AND cp.user_id = auth.uid())
  );

-- RLS: Users can unstar their own starred messages
CREATE POLICY "Users can unstar messages" ON public.starred_messages
  FOR DELETE TO authenticated USING (user_id = auth.uid());
```

---

## Server Actions

**File:** `src/lib/actions/messages.ts` (extension)

### New actions to add:

```typescript
// Edit message (within 15 minutes)
export async function editMessage(messageId: string, newContent: string) {
  // Verify ownership and time constraint
  // Update edited_at timestamp
}

// Soft-delete message
export async function deleteMessage(messageId: string) {
  // Verify ownership
  // Set deleted_at = NOW()
}

// Forward message to conversations
export async function forwardMessage(messageId: string, targetConversationIds: string[]) {
  // Verify authorization for source and targets
  // Insert copies of message to target conversations
}

// Reactions
export async function toggleReaction(messageId: string, emoji: string)
export async function getMessageReactions(messageId: string)

// Starred messages
export async function toggleStar(messageId: string)
export async function getStarredMessages()
```

---

## Components to Create

| File | Purpose |
|------|---------|
| `src/stores/message-actions-store.ts` | Zustand store: reply/edit/forward state |
| `src/hooks/use-reactions.ts` | Hook: fetch reactions, toggle, realtime subscription |
| `src/hooks/use-starred-messages.ts` | Hook: starred messages, toggle, isStarred check |
| `src/components/chat/message-context-menu.tsx` | Right-click menu (Reply, Edit, Delete, Forward, Star) |
| `src/components/chat/reply-preview.tsx` | Preview bar above input showing replied message |
| `src/components/chat/message-reactions.tsx` | Reactions row below message bubble |
| `src/components/chat/emoji-picker.tsx` | Emoji grid popup (24 common emojis) |
| `src/components/chat/forward-modal.tsx` | Modal: select conversations to forward to |
| `src/app/(chat)/starred/page.tsx` | Page: list all starred messages |

---

## chat-view.tsx Modifications

### State additions:
```typescript
const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null)
const [editingMessage, setEditingMessage] = useState<Message | null>(null)
```

### Reply Preview (above input):
```tsx
<ReplyPreview replyingTo={replyingToMessage} replyingToProfile={participant} />
```

### Message Bubble enhancements:
- Add `onContextMenu` handler to trigger context menu
- Show `(edited)` label if `edited_at` is set
- Show `This message was deleted` if `deleted_at` is set
- Show reactions row below bubble

### Input area changes:
- If `editingMessage`: show "Edit message" placeholder, send → save
- Include `reply_to` in message insert when replying

### Handlers:
- `handleEdit`: validate time window, call server action, update local state
- `handleDelete`: confirm dialog, call server action, mark as deleted
- `handleForward`: open forward modal

---

## Key UI Patterns

### Context Menu (follows notification-center pattern):
```tsx
<div className="fixed inset-0 z-40 bg-black/20" onClick={close} />
<div className="fixed z-50 w-56 rounded-xl border..." style={{left, top}}>
  <MenuItem icon={Reply} label="Reply" onClick={handleReply} />
  <MenuItem icon={Pencil} label="Edit" onClick={handleEdit} />
  ...
</div>
```

### Toast feedback (use existing notification-store):
```typescript
import { useNotificationStore } from '@/stores/notification-store'
const addToast = useNotificationStore((state) => state.addToast)
addToast({ type: 'system', title: 'Message edited', body: '' })
```

### Animations (use existing globals.css):
```tsx
<div className="animate-fade-in ...">New element</div>
```

---

## Testing Checklist

- [ ] Reply to message → shows preview → sends with reply_to
- [ ] Edit within 15 min → "(edited)" label appears
- [ ] Edit after 15 min → error toast
- [ ] Delete → confirm dialog → "deleted" placeholder
- [ ] Forward → modal opens → select conversations → sent
- [ ] Add reaction → appears below message
- [ ] Remove reaction → disappears
- [ ] Star message → appears in starred page
- [ ] Unstar → disappears from starred page
- [ ] All work in dark/light mode

---

## File Summary

### Create (11 files):
1. `supabase/migrations/20250101000017_add_reactions_support.sql`
2. `supabase/migrations/20250101000018_add_starred_messages.sql`
3. `src/stores/message-actions-store.ts`
4. `src/hooks/use-reactions.ts`
5. `src/hooks/use-starred-messages.ts`
6. `src/components/chat/message-context-menu.tsx`
7. `src/components/chat/reply-preview.tsx`
8. `src/components/chat/message-reactions.tsx`
9. `src/components/chat/emoji-picker.tsx`
10. `src/components/chat/forward-modal.tsx`
11. `src/app/(chat)/starred/page.tsx`

### Modify (2 files):
1. `src/lib/actions/messages.ts` - add server actions
2. `src/components/chat/chat-view.tsx` - integrate all features

### Update (2 files):
1. `src/types/database.ts` - add reactions/starred tables
2. `docs/03-phases.md` - mark 4.4 as done
