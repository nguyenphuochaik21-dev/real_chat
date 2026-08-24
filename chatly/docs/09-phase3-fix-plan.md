# Phase 3 Fix Plan - Realtime Features

> **Created**: 2026-08-23
> **Status**: Pending Implementation
> **Priority**: High

---

## 🔍 Phân tích vấn đề hiện tại

### Problem 1: Read Receipts - ✓✓ hiển thị ngay khi chưa đọc

**Mô tả**: Khi user A gửi message cho user B, message hiển thị ✓✓ (delivered) ngay lập tức dù B chưa xem.

**Root Cause**:
- Trigger `handle_new_message_delivered` trong migration set `NEW.status = 'delivered'` trong BEFORE INSERT
- Điều này khiến message được deliver NGAY khi insert vào database
- Cả người gửi (A) lẫn người nhận (B) đều thấy ✓✓
- **Logic đúng nên là**: A chỉ thấy ✓ (sent) cho đến khi B nhận được message

**Ảnh hưởng**:
- User không biết message đã được gửi đến recipient hay chưa
- Trải nghiệm không đúng như WhatsApp/Telegram

### Problem 2: Unread Badge không realtime khi không ở trong conversation

**Mô tả**: Khi user A gửi message cho user B (A không ở trong conversation), badge không tự động tăng. Phải F5 (refresh) mới thấy.

**Root Cause**:
- Subscription trong `chats-list.tsx` subscribe `INSERT` trên `messages` nhưng **không filter đúng**
- `fetchConversations()` bị race condition hoặc debounce delay
- Logic unread count dựa trên `last_read_at` nhưng không update kịp thời khi có message mới

**Ảnh hưởng**:
- User không biết có message mới từ conversation khác
- Phải refresh thủ công để thấy notification

---

## 📋 Kế hoạch Fix

### Step 1: Fix Auto-Delivered Trigger

**Mục tiêu**: Chỉ mark message là `delivered` khi recipient thực sự online/received

**File**: `supabase/migrations/20250101000013_fix_delivered_trigger.sql`

```sql
-- Migration: 20250101000013_fix_delivered_trigger.sql
-- Description: Fix auto-delivered logic - only deliver when recipient is online

-- Replace the existing function with smarter logic
CREATE OR REPLACE FUNCTION public.handle_new_message_delivered()
RETURNS TRIGGER AS $$
DECLARE
  v_conversation_type TEXT;
  v_online_count INT;
BEGIN
  -- Only process for messages with 'sent' status
  IF NEW.status = 'sent' THEN
    SELECT type INTO v_conversation_type
    FROM public.conversations
    WHERE id = NEW.conversation_id;

    -- For direct messages, check if recipient is online
    IF v_conversation_type = 'direct' THEN
      SELECT COUNT(*) INTO v_online_count
      FROM public.conversation_participants cp
      JOIN public.profiles p ON p.id = cp.user_id
      WHERE cp.conversation_id = NEW.conversation_id
        AND cp.user_id != NEW.sender_id
        AND p.status = 'online';

      -- Only mark as delivered if recipient is online
      IF v_online_count > 0 THEN
        NEW.status = 'delivered';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_message_auto_deliver ON public.messages;
CREATE TRIGGER on_message_auto_deliver
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_message_delivered();
```

**Giải thích**:
- Khi A gửi message cho B (B offline): status = `sent` → A thấy ✓
- Khi A gửi message cho B (B online): status = `delivered` → A thấy ✓✓ xám
- Khi B mở chat và đọc: status = `read` → A thấy ✓✓ xanh

---

### Step 2: Fix Read Receipts Display Logic

**Mục tiêu**: Đảm bảo hiển thị đúng theo trạng thái thực

**File**: `src/components/chat/chat-view.tsx`

**Current code** (MessageBubble):
```tsx
// Use realtime status if available, otherwise use stored status
const messageStatus = realtimeStatus || message.status || 'sent'

// Display logic
{messageStatus === 'read' ? (
  <CheckCheck className="h-3.5 w-3.5 text-emerald-500" />
) : messageStatus === 'delivered' ? (
  <CheckCheck className="h-3.5 w-3.5 text-[var(--text-muted)]" />
) : messageStatus === 'sent' || messageStatus === 'sending' ? (
  <Check className="h-3.5 w-3.5" />
) : null}
```

**Issues to fix**:
1. Chỉ hiển thị check marks cho `isFromMe` (message của chính mình)
2. Subscribe UPDATE messages để nhận realtime khi B đọc
3. Update local state `messageStatuses` Map khi nhận UPDATE

**Required changes**:
```tsx
// Trong useEffect subscribe
.on('postgres_changes', {
  event: 'UPDATE',
  schema: 'public',
  table: 'messages',
  filter: `conversation_id=eq.${conversationId}`,
}, (payload) => {
  const updated = payload.new as Message
  // Update both message list AND status map
  setMessages(prev => prev.map(m =>
    m.id === updated.id ? { ...m, status: updated.status } : m
  ))
  setMessageStatuses(prev => {
    const next = new Map(prev)
    next.set(updated.id, updated.status || 'sent')
    return next
  })
})
```

---

### Step 3: Fix Unread Badge Realtime

**Mục tiêu**: Badge tự động update khi có message mới mà không cần F5

**File**: `src/components/chat/chats-list.tsx`

**Current issue**:
```tsx
// Current subscription - không filter đúng
.on('postgres_changes', {
  event: 'INSERT',
  schema: 'public',
  table: 'messages',
}, () => {
  fetchConversations() // Refetch toàn bộ - chậm + race condition
})
```

**Solution**: Optimistic update local state thay vì refetch toàn bộ

**Required changes**:

```tsx
// Thêm state để track
const [conversationIds, setConversationIds] = useState<Set<string>>(new Set())

// Trong fetchConversations - lưu conversationIds
const convIds = new Set<string>()
// ... sau khi fetch conversations
conversations.forEach(c => convIds.add(c.id))
setConversationIds(convIds)

// Subscription với local update
useEffect(() => {
  const channel = supabase
    .channel('unread-updates')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
    }, (payload) => {
      const newMsg = payload.new as Message

      // Chỉ update nếu message thuộc conversation của current user
      if (!conversationIds.has(newMsg.conversation_id)) return

      // Chỉ tăng unread nếu sender không phải current user
      if (newMsg.sender_id === currentUserId) return

      // Optimistic update - tăng unread count
      setConversations(prev => prev.map(conv => {
        if (conv.id === newMsg.conversation_id) {
          return {
            ...conv,
            unread_count: conv.unread_count + 1,
            last_message: newMsg
          }
        }
        return conv
      }))
    })
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'conversation_participants',
      filter: `user_id=eq.${currentUserId}`,
    }, (payload) => {
      // Khi last_read_at update → giảm unread count về 0
      const updated = payload.new as { conversation_id: string; last_read_at: string }
      setConversations(prev => prev.map(conv => {
        if (conv.id === updated.conversation_id) {
          return { ...conv, unread_count: 0 }
        }
        return conv
      }))
    })
    .subscribe()

  return () => supabase.removeChannel(channel)
}, [currentUserId, supabase, conversationIds])
```

---

## 📁 Files cần thay đổi

| File | Action | Mô tả |
|------|--------|-------|
| `supabase/migrations/20250101000013_fix_delivered_trigger.sql` | Tạo mới | Fix trigger logic |
| `src/components/chat/chat-view.tsx` | Sửa | Fix subscription + display logic |
| `src/components/chat/chats-list.tsx` | Sửa | Optimistic unread updates |

---

## 🧪 Test Cases

### Test 1: Read Receipts

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | A gửi message cho B (B offline) | A thấy ✓ (sent) |
| 2 | B online nhưng chưa mở chat | A thấy ✓ (vẫn sent) |
| 3 | B mở chat (message chưa đọc) | A thấy ✓✓ xám (delivered) |
| 4 | B đọc message | A thấy ✓✓ xanh (read) |

### Test 2: Unread Badge

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | A ở trong /chats page | - |
| 2 | B gửi message cho A | Badge tự động tăng (không F5) |
| 3 | A mở conversation B | Badge reset về 0 |
| 4 | B gửi thêm message (A đang ở /chats) | Badge tăng realtime |

### Test 3: Realtime Sync

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | B mở chat với A (2 tabs) | - |
| 2 | A gửi message | Cả 2 tabs đều thấy message realtime |
| 3 | B đọc message | A thấy ✓✓ xanh ngay |

---

## ⏱️ Estimated Time

| Task | Time |
|------|------|
| Tạo migration fix trigger | 5 min |
| Fix chat-view.tsx subscription | 5 min |
| Fix chats-list.tsx optimistic updates | 15 min |
| Testing | 10 min |
| **Total** | **~35 min** |

---

## 🚀 Next Steps

1. Chạy migration mới trên Supabase SQL Editor
2. Implement changes trong 3 files trên
3. Test với 2 users (2 browsers/tabs)
4. Verify tất cả test cases pass
5. Chuyển sang Phase tiếp theo

---

## 📌 Checklist trước khi sang Phase mới

- [ ] Read Receipts: ✓ → ✓✓ xám → ✓✓ xanh hoạt động đúng flow
- [ ] Unread Badge: Tự động tăng khi có message mới (không F5)
- [ ] Unread Badge: Reset về 0 khi mở conversation
- [ ] Realtime: Message hiển thị ngay cho cả sender và receiver
- [ ] Không có console errors liên quan đến realtime
