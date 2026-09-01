# 08 - Tasks Tracker

> Format: `[ ]` chưa làm, `[~]` đang làm, `[x]` xong, `[!]` blocked.

## Phase 0 — Setup & Planning ✅

- [x] Khởi tạo project folder và docs
- [x] Viết CLAUDE.md
- [x] Viết các file docs/ (00-08)
- [x] Nghiên cứu stack (Next.js 16 + Supabase)
- [x] Tạo agents tùy chỉnh
- [x] Tạo skills tùy chỉnh
- [x] **User duyệt kế hoạch tổng thể** ✅
- [x] Tạo Next.js 16 project (`npx create-next-app@latest`)
- [x] Cài đặt dependencies
- [x] Setup Tailwind v4 + design tokens
- [x] Setup ESLint + Prettier
- [x] Tạo git repo + initial commit ✅

## Phase 1 — UI đầy đủ với Mock Data ✅

### 1.1. Foundation ✅

- [x] Setup next-themes
- [x] Design tokens (colors, spacing, typography)
- [x] UI components: Avatar, Button, Input, Badge, ScrollArea, Separator

### 1.2. Mock data ✅

- [x] `lib/mock/users.ts` - 10 users
- [x] `lib/mock/conversations.ts` - 8 conversations
- [x] `lib/mock/messages.ts` - 30+ messages
- [x] `lib/mock/calls.ts` - 8 call history
- [x] `lib/mock/status.ts` - prototype cũ, đã xóa khi bỏ Status

### 1.3. Sidebar ✅

- [x] Logo + nav items (Chats, Contacts, Calls, Settings); Status đã được gỡ
- [x] Active state highlight
- [x] User avatar bottom

### 1.4. Chats list panel ✅

- [x] Search + tabs (All, Unread, Personal)
- [x] Conversation item (avatar, name, last message, time, unread badge, pin icon)
- [x] Pin/archive states
- [x] Empty state

### 1.5. Chat view ✅

- [x] Header with actions (call, video, menu); search is available from the menu
- [x] Message bubble (incoming/outgoing)
- [x] Date separator
- [x] Chat input (emoji, paperclip, send)
- [x] Auto-scroll
- [x] Message status (sent, delivered, read)

### 1.6. Info panel ✅

- [x] Gradient header
- [x] Avatar + status
- [x] Action buttons (Call, Video, Mute, Search)
- [x] Sections (About, Phone, Email, Media grid, Groups)

### 1.7. Other pages ✅

- [x] Contacts (alphabetical with letter headers)
- [x] Calls (filter by all/missed/incoming/outgoing)
- [x] Status prototype đã được xóa theo quyết định sản phẩm
- [x] Settings (Profile, Appearance sub-pages)

### 1.8. Polish ✅

- [x] Dark/Light mode
- [x] Animations (fadeIn, slideIn)
- [x] Empty states

## Phase 2 — Auth & Real Database ✅

### 2.1. Supabase setup ✅

- [x] Dependencies already installed (`@supabase/ssr`, `@supabase/supabase-js`)
- [x] Create `lib/supabase/client.ts`, `server.ts`, `middleware.ts`
- [x] Create `src/middleware.ts` for session refresh
- [x] Create `.env.example`
- [x] Migrations created (user ran them)
- [x] Types generated

### 2.2. Auth flow ✅

- [x] Middleware refresh session + protected routes
- [x] Login page (email/password + OAuth + magic link)
- [x] Register page (with password validation)
- [x] Magic link flow
- [x] OAuth callback handler
- [x] Logout
- [x] Protected routes (redirect to login)

### 2.3. Database migrations ✅

- [x] Create migrations: profiles, conversations, participants, messages, RLS policies
- [x] TypeScript types in `src/types/database.ts`

### 2.4. Replace mock with real data ✅

- [x] Server Actions: `auth.ts`, `profile.ts`, `conversations.ts`, `messages.ts`
- [x] Hooks: `use-auth.ts`, `use-profile.ts`, `use-conversations.ts`, `use-messages.ts`, `use-contacts.ts`
- [x] `ChatsList` updated to fetch from Supabase
- [x] `ChatView` updated with real messages + send message
- [x] `ContactsPage` updated - can start new conversations
- [x] `Settings` pages updated with real profile data
- [x] `Sidebar` loads real profile

### 2.5. Profile setup ✅

- [x] Settings > Profile saves to `profiles` table

## Phase 3 — Realtime ✅ (HOÀN TẤT)

### 3.1. Realtime messages ✅

- [x] `use-messages.ts` - subscribe to postgres_changes INSERT/UPDATE
- [x] `ChatView` - optimistic update when sending
- [x] Auto-scroll to new messages

### 3.2. Online presence ✅

- [x] `use-presence.ts` hook - Supabase Presence API
- [x] Track online/offline status realtime
- [x] `Avatar` component with `statusOverride` prop
- [x] Show online indicator in chats list and chat header

### 3.3. Typing indicators ✅

- [x] `use-typing.ts` hook - broadcast typing events
- [x] "User is typing..." text in chat header
- [x] Auto-stop after 3 seconds inactivity
- [x] Debounce input

### 3.4. Read receipts ✅

- [x] `use-read-receipts.ts` hook
- [x] Mark messages as read when opening conversation
- [x] Update ✓✓ to green when message is read
- [x] Broadcast read events to other participants

### 3.5. Unread counts ✅

- [x] Badge on conversations list items
- [x] **Badge on sidebar Chats icon** ← mới thêm
- [x] Realtime update via subscription

## Phase 4 — Rich Features ✅ (2026-08-27)

### 4.1. Media & Files ✅

- [x] Migration thêm media columns (content_type, media_url, media_name, etc.)
- [x] Supabase Storage bucket `chat-media`
- [x] `lib/supabase/storage.ts` - Upload, delete, validation
- [x] `hooks/use-media-upload.ts` - Upload với progress
- [x] `components/chat/media-message-bubble.tsx` - Render image/video/audio/file
- [x] `components/chat/media-attachment-button.tsx` - Upload button group
- [x] Tích hợp vào ChatView
- [x] Preview trong chat
- [x] **Media gallery viewer modal** - xem tất cả ảnh/files của conversation
- [x] Nút gallery trong header chat (icon Image)
- [ ] File size limit feedback UI đẹp hơn

### 4.2. Search ✅

- [x] Migration thêm search support (tsvector, GIN index, search function)
- [x] `lib/actions/search.ts` - Server Actions cho searchMessages và searchConversations
- [x] `hooks/use-search.ts` - Hook với debounce và pagination
- [x] `components/chat/search-modal.tsx` - Modal với 2 tabs: Messages và Contacts
- [x] Tích hợp nút Search vào Sidebar
- [x] Filter theo ngày (date from/to)
- [x] Highlight text trong kết quả search
- [x] Navigate đến conversation khi chọn message

### 4.3. Notifications ✅

- [x] NotificationBell: bell icon với unread badge trong sidebar
- [x] NotificationToast: toast popup (auto-dismiss sau 5s)
- [x] NotificationCenter: slide-in panel với notification list
- [x] NotificationStore: Zustand store cho state management
- [x] useNotifications hook: real-time subscription tới messages mới
- [x] Skip notifications cho conversation hiện tại (tránh duplicate)
- [x] Mark as read khi mở, clear all, remove individual
- [x] Realtime: toast xuất hiện ngay khi có message từ conversation khác
- Commit: 491e553

### 4.4. Message features ✅

- [x] Reply to message
- [x] Edit message
- [x] Delete message (soft delete)
- [x] Forward message
- [x] Reactions (emoji), nhấp đúp/chạm đúp để thả tim
- [x] Star/Pin message

### 4.5. Conversation management ✅

- [x] Archive conversations (with Archived tab)
- [x] Pin/Unpin conversation
- [x] Mute/Unmute conversation
- [x] Block user (from message context menu)
- [x] Unblock user (from Blocked Users modal)
- [x] Delete conversation (xóa vĩnh viễn bằng RPC có kiểm tra quyền)
- [x] Clear conversation history (soft delete own messages)
- [x] Filter blocked users from conversations list

### 4.6. Scheduled Messages, Drafts & Labels ✅ (2026-08-27)

- [x] Migration: `20250103000000_scheduling_labels.sql`
- [x] Migration: `20250104000000_pg_cron_scheduled_messages.sql`
- [x] `use-scheduled-messages.ts` - Hook xử lý scheduled messages
- [x] `use-scheduled-messages-processor.ts` - Client-side processor (30s polling)
- [x] `lib/actions/scheduled-messages.ts` - Server Actions
- [x] `schedule-picker.tsx` - Schedule time picker UI
- [x] pg_cron function `send_scheduled_messages()` - Auto-send khi tab đóng
- [x] `use-draft-store.ts` + `stores/draft-store.ts` - Draft state với Zustand
- [x] Auto-save/restore draft khi typing
- [x] Hiển thị "Draft: ..." trong chats list
- [x] `lib/actions/labels.ts` - Server Actions cho labels
- [x] `use-conversation-labels.tsx` - Context provider cho labels
- [x] `label-manager.tsx` - Label manager modal UI
- [x] Filter by label trong sidebar
- [x] Realtime sync cho labels

### 4.7. Voice/Video UI ✅ (2026-08-27)

- [x] `stores/call-store.ts` - Zustand store với call state management
- [x] `components/calls/call-screen.tsx` - Full-screen call UI
- [x] `components/calls/incoming-call-modal.tsx` - Incoming call modal
- [x] Tích hợp CallScreen/IncomingCallModal vào chat layout
- [x] Phone/Video buttons trong chat header gọi initiateCall
- [x] Call controls: mute, video toggle, speaker, end call
- [x] Duration timer (MM:SS format)
- [x] Local video preview (picture-in-picture)

## Phase 5 — Voice/Video (WebRTC) 🚧 (2026-08-27)

### 5.1. Database Schema 🚧

- [x] Migration `20250105000000_webrtc_calls.sql`
- [x] Bảng `call_sessions` với WebRTC signaling data
- [x] Bảng `call_history` cho lịch sử cuộc gọi
- [x] RPC functions: initiate_call, update_call_status, end_call, get_call_history
- [x] RLS policies cho call sessions/history
- [x] Realtime enabled trên call_sessions

### 5.2. WebRTC Service ✅

- [x] `lib/webrtc.ts` - WebRTCService class
- [x] RTCPeerConnection management
- [x] Signaling qua Supabase broadcast channels
- [x] ICE candidate handling
- [x] Media controls (mute, camera toggle, switch camera)

### 5.3. Call Provider & Hooks ✅

- [x] `hooks/use-webrtc-call.ts` - WebRTC lifecycle hook
- [x] `hooks/use-call-history.ts` - Call history hook
- [x] `components/calls/call-provider.tsx` - Call provider
- [x] Event-based communication (call:initiate, etc.)

### 5.4. UI Integration ✅

- [x] Cập nhật call-screen với remote stream display
- [x] Cập nhật incoming-call-modal với real actions
- [x] Cập nhật chat-view dispatch events
- [x] Wrap app với CallProvider
- [x] Cập nhật calls/page.tsx với real history

### 5.5. Call History Page ✅

- [x] Sử dụng `useCallHistory` hook
- [x] Group calls by date
- [x] Filter: All, Missed, Incoming, Outgoing

## Phase 7 — Group Chat, PWA & Polish ✅ (2026-09-01)

### 7.1. Group chat và phân quyền ✅

- [x] Migration vai trò owner/admin/member và RLS/RPC bảo vệ mutation
- [x] Tạo nhóm nguyên tử từ tối thiểu hai bạn bè đã chấp nhận
- [x] Mời/xóa thành viên, đổi admin, đổi tên, rời và xóa nhóm
- [x] Hiển thị sender, avatar, tiêu đề và số thành viên theo Realtime

### 7.2. PWA, mobile và chất lượng ✅

- [x] Manifest, icon 192/512, service-worker registration và offline fallback
- [x] Install prompt, trạng thái online/offline và mobile safe-area
- [x] Conversation summary RPC, lazy-loaded modal và tối ưu ảnh
- [x] Keyboard/dialog semantics, reduced motion, contrast WCAG A/AA

### 7.3. Verification ✅

- [x] Playwright + Axe trên desktop và Pixel 7
- [x] ESLint 0 error và TypeScript strict
- [x] Next.js production build
- [ ] Chạy group mutation E2E bằng tài khoản release có ít nhất hai bạn bè
- [ ] Smoke test PWA/offline/push trên thiết bị vật lý

---

## Backlog (chưa xếp phase)

- [ ] Thiết lập CI/CD (GitHub Actions: typecheck, lint, test, build)
- [ ] Setup Vercel deployment
- [ ] Custom domain
- [ ] Sentry error tracking
- [ ] Analytics (Plausible/PostHog)
- [ ] SEO optimization (không quan trọng nhưng nên có)
