# Plan: Fix Phase 4.4 Message Features

## Context
Testing Phase 4.4 reveals 4 issues with reply, edit, delete realtime sync, and reactions UI:
1. **Reply**: Preview shows but sent message doesn't include `reply_to` reference
2. **Edit**: User B doesn't see edits from User A in realtime (must F5)
3. **Delete**: User B doesn't see deletions from User A in realtime (must F5)
4. **Reactions**: No emoji picker row visible on messages + "Rendering..." spinner performance issue

---

## Issues to Fix

### 1. Reply Not Working
**Root cause**: The `reply_to` field IS being set in the code (line 624), but might be passing `null` because `replyToMessage` from store might not have `id` populated correctly.

**Fix**: Add debug logging to verify `replyToMessage?.id` value, and ensure the store properly holds the message reference.

### 2. Edit Not Syncing (User B can't see User A's edits)
**Root cause**: The realtime subscription at line 424-450 only handles UPDATE events for **status changes**, not content changes. When a message is edited, the content update is not being propagated.

**Fix**: Update the UPDATE handler to also sync content, `edited_at` timestamp changes.

### 3. Delete Not Syncing (User B can't see User A's deletions)
**Root cause**: There is NO DELETE event handler in the subscriptions! When a message is deleted, User B never gets notified.

**Fix**: Add a DELETE event subscription that sets `deleted_at` on the message.

### 4. Reactions UI Missing + Performance Issue
**User confirmed**: Emoji picker should appear on each message (hover/click on message shows emoji picker below it, like Telegram/Discord)

**Root cause**:
- `MessageReactions` only renders when `reactions.length > 0` (line 220, 180)
- No hover/click handler on message bubble to show reactions row
- The "Rendering..." spinner comes from `getMessageReactions()` being called for EVERY message, creating excessive database queries

**Fix**:
- Add hover state to MessageBubble to show/hide reactions row
- `MessageReactions` always renders (remove null guard)
- Optimize reactions fetch with batch query instead of per-message calls

---

## Files to Modify

1. **`src/components/chat/chat-view.tsx`**
   - Add UPDATE handler for content/edited_at changes
   - Add DELETE event subscription
   - Change `reactions.length > 0` to always show `MessageReactions`
   - Add emoji picker state and handler to input bar smiley button
   - Optimize reactions fetch (batch or debounce)

2. **`src/components/chat/message-reactions.tsx`**
   - Remove the `if (reactions.length === 0 && !showPicker) return null` guard
   - Always render the add reaction button

---

## Verification
1. Test reply: Reply to a message, send, verify `reply_to` in database
2. Test edit: User A edits message, verify User B sees update in <2 seconds
3. Test delete: User A deletes message, verify User B sees deletion in <2 seconds
4. Test reactions: Click smiley on any message, emoji picker appears, select emoji, verify reaction shows
