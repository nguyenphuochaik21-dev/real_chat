# Chatly Progress Tracking

## Session Summary - Latest Changes

### Phase 4.6 - Advanced Messaging Features (Completed ✅)

**New Files Created:**
1. `supabase/migrations/20250103000000_scheduling_labels.sql` - Database schema for scheduled messages, conversation labels
2. `src/lib/actions/scheduled-messages.ts` - Server actions for scheduling
3. `src/lib/actions/labels.ts` - Server actions for labels CRUD
4. `src/stores/draft-store.ts` - Zustand store for draft messages (localStorage)
5. `src/hooks/use-scheduled-messages.ts` - Hook for scheduled messages
6. `src/hooks/use-conversation-labels.ts` - Hook for conversation labels
7. `src/components/chat/schedule-picker.tsx` - Schedule message UI
8. `src/components/chat/label-manager.tsx` - Label management UI
9. `src/types/database.ts` - Updated with new table types (scheduled_messages, conversation_labels, conversation_label_map, user_blocks, push_subscriptions)

**Features Implemented:**

1. **Scheduled Messages** ✅
   - Database table `scheduled_messages` with RLS policies
   - Database function `send_scheduled_message` for auto-sending
   - UI: Schedule picker with quick options (tomorrow, next week, etc.)
   - Custom date/time picker
   - Hook: `useScheduledMessages` for managing scheduled messages

2. **Conversation Labels** ✅
   - Database tables: `conversation_labels`, `conversation_label_map`
   - RLS policies for secure access
   - Hook: `useConversationLabels` for managing labels
   - UI: Label manager with color picker
   - Preset colors + custom color picker

3. **Draft Messages (localStorage)** ✅
   - Store: `useDraftStore` for persisting drafts
   - Auto-save with 5 second debounce
   - Load/save from localStorage
   - Draft indicator in chat list

4. **UI Integration** ✅
   - `chat-view.tsx` - Clock button, schedule picker modal, draft restoration
   - `chats-list.tsx` - Label filter dropdown, label dots, draft indicators
   - `conversation-actions.tsx` - Labels menu item, label manager modal

**Database Types Updated:**
- Added `scheduled_messages` table type
- Added `conversation_labels` table type
- Added `conversation_label_map` table type
- Added `user_blocks` table type
- Added `push_subscriptions` table type
- Added `scheduled_message_status` enum
- Added `send_scheduled_message` function type

**Migration Required:**
Run the migration in Supabase SQL Editor or via Supabase CLI:
```bash
cd chatly && npx supabase db push
```

Or manually execute the SQL in `supabase/migrations/20250103000000_scheduling_labels.sql`

---

### Phase 4.5 - Conversation Management (Completed)

**Completed Features:**
1. ✅ Archive/Unarchive conversations
   - Tab "Archived" in ChatsList
   - Realtime sync via conversation_participants subscription
   - Conversations move between active/archived lists

2. ✅ Pin/Unpin conversations
   - Realtime sync
   - Pinned conversations sorted first

3. ✅ Mute/Unmute conversations
   - Blocks in-app notifications
   - Muted icon shows in chat list (BellOff)
   - Check is_muted before showing notification

4. ✅ Block User functionality
   - user_blocks table created
   - Blocked users filtered from chat list
   - Block check in notification logic

5. ✅ Clear History
   - Soft delete user's messages
   - Shows "Message deleted" placeholder

### Bug Fixes Applied

1. **Hydration Mismatch (Fixed)**
   - Tab state now initialized as 'all' on server
   - Restored from localStorage in useEffect after hydration

2. **Archive Move Between Lists (Fixed)**
   - Realtime subscription moves conversations between active/archived
   - Sort archived by pinned + date

3. **Chat View Full Width (Fixed)**
   - Added w-full min-w-0 to ChatView container

4. **Pin + Mute Icons Display (Fixed)**
   - CSS: both icons shown with shrink-0 to prevent overlap

5. **Mute Blocks Notifications (Fixed)**
   - use-notifications.ts checks is_muted and is_archived
   - Also checks user_blocks before showing notification
   - **sidbar.tsx ALSO had notification subscription without checks** ← FIXED
     - Added same checks to sidebar.tsx `setupNotificationSubscription`

### New: Browser Push Notifications

**Files Created:**
- `public/sw.js` - Service Worker for push notifications
- `src/hooks/use-push-notifications.ts` - Push subscription management
- `src/components/notifications/notification-permission.tsx` - Permission UI
- `supabase/migrations/20250102000000_add_push_subscriptions.sql` - Push subscriptions table

**Updated Files:**
- `src/stores/notification-store.ts` - Added browser notification support
- `src/hooks/use-notifications.ts` - Added debug logging, fixed block check
- `src/lib/actions/conversations.ts` - toggleMuted now returns verification

### Migration Required

Run this SQL in Supabase SQL Editor:

```sql
-- Push Subscriptions table for Web Push Notifications
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Only allow users to manage their own subscriptions
CREATE POLICY "Users can manage their own subscriptions"
ON push_subscriptions
FOR ALL
USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
```

### How Browser Notifications Work

1. User sees "Enable notifications" prompt in ChatsList
2. After permission granted, notifications show even when tab is hidden
3. Notification appears as system notification
4. Clicking notification navigates to conversation

### Debugging

Check browser console for logs:
- `[useNotifications]` - Message receive flow
- `[toggleMuted]` - Mute toggle verification
- `[NotificationStore]` - Browser notification status

### Git Commits (Do NOT use git commands)

All changes are auto-saved. Track commits manually:
- `1584685` - fix: realtime pin/mute/archive sync, mute blocks notifications, tab persistence
- `f41fddf` - fix: hydration mismatch, archive move between lists, chat view full width

---

## Previous Sessions

### Phase 4 - Realtime Features
- Message reactions (emoji)
- Edit message
- Delete message
- Typing indicators
- Read receipts
- Online/offline status

### Phase 3 - Core Chat
- Direct messaging
- Group conversations
- Message sending/receiving
- Real-time updates via Supabase
