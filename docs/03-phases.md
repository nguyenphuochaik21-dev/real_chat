# 03 - Roadmap & Phases

## Tổng quan

Dự án chia thành **7 phases** rõ ràng. Mỗi phase có deliverable cụ thể, có thể demo độc lập.

---

## Phase 0 — Setup & Planning ✅

**Mục tiêu**: Chuẩn bị mọi thứ trước khi code.
**Trạng thái**: ✅ Hoàn thành (2026-08-22)

### Tasks

- [x] Nghiên cứu stack (Next.js 16 + Supabase)
- [x] Viết CLAUDE.md và docs/
- [x] Tạo agents và skills tùy chỉnh
- [x] User duyệt kế hoạch tổng thể
- [x] Tạo Next.js 16 project (create-next-app)
- [x] Cài đặt dependencies (Tailwind, shadcn, Supabase client)
- [x] Setup ESLint, Prettier, Husky
- [x] Tạo repo git và push initial commit

### Deliverable

- Project skeleton chạy được `npm run dev`
- Tất cả docs files được viết xong
- Git history sạch

---

## Phase 1 — UI đầy đủ với Mock Data 🎨 ✅

**Mục tiêu**: Toàn bộ giao diện giống template, dùng mock data cứng.
**Trạng thái**: ✅ Hoàn thành (2026-08-23)

### Tasks

#### 1.1. Setup UI foundation ✅

- [x] Setup Tailwind v4 với design tokens
- [x] Setup next-themes cho dark/light mode
- [x] Cài shadcn/ui: button, input, dropdown-menu, dialog, avatar, badge, tooltip, scroll-area, separator, switch, tabs
- [x] Tạo design tokens file (colors, spacing, typography)
- [x] Tạo layout root với theme provider

#### 1.2. Mock data layer ✅

- [x] Tạo `lib/mock/users.ts` — 10 user mẫu với avatar, online status, etc.
- [x] Tạo `lib/mock/conversations.ts` — 8 conversations
- [x] Tạo `lib/mock/messages.ts` — 50+ messages với timestamps
- [x] Tạo `lib/mock/calls.ts` — call history
- [x] Tạo `lib/mock/status.ts` — status updates
- [x] Helper hook `useCurrentUser()` trả về user giả lập

#### 1.3. Sidebar (left navigation) ✅

- [x] Component `Sidebar` với logo + nav items
- [x] Icons: chat, contacts, calls, status, settings
- [x] Active state highlight
- [x] User avatar ở dưới cùng với menu
- [x] Mobile: collapse thành bottom nav (optional cho Phase 1)

#### 1.4. Chats list (panel thứ 2) ✅

- [x] Component `ChatsListPanel`
- [x] Search input ở top
- [x] Tabs: All / Unread / Groups / Personal
- [x] Conversation item: avatar + tên + last message + time + unread badge + pin icon
- [x] Pinned conversations ở trên cùng
- [x] Empty state khi không có chat

#### 1.5. Chat view (panel thứ 3) ✅

- [x] Component `ChatView`
- [x] Header: avatar + tên + online status + actions (call, video, menu)
- [x] Date separator ("Saturday, Aug 22")
- [x] Message bubble: incoming (trái, trắng) vs outgoing (phải, indigo)
- [x] Message status: sent (✓) / delivered (✓✓) / read (✓✓ xanh)
- [x] Avatar cho từng message incoming
- [x] Chat input ở dưới: emoji button + input + send button
- [x] Auto-scroll to bottom

#### 1.6. Info panel (panel thứ 4 - mở rộng) ✅

- [x] Component `InfoPanel` với gradient header
- [x] Avatar lớn + tên + status
- [x] Action buttons: Call, Video, Mute, Search
- [x] About section (bio)
- [x] Phone, Email sections
- [x] Media & Files grid (6 ô màu: image, video, pdf, ...)
- [x] Groups in Common
- [x] Notification toggle
- [x] Close button (X)

#### 1.7. Contacts page ✅

- [x] List contacts theo alphabet với letter headers (A, D, E, L, M, S)
- [x] Search bar
- [x] Action icons (call, message)
- [x] Online indicator

#### 1.8. Calls page ✅

- [x] Tabs: All / Missed / Incoming / Outgoing
- [x] Call item: avatar + tên + time + duration + call type icon (video/voice)
- [x] Filter

#### 1.9. Navigation cleanup ✅

- [x] Removed the Favorites page and navigation entry

#### 1.10. Status page ✅

- [x] "My Status" ở trên với "+" add button
- [x] Recent updates list (status mới nhất)
- [x] Seen status

#### 1.11. Settings page ✅

- [x] Profile card ở trên (avatar, tên, bio, QR)
- [x] Sections: Account, Notifications, Appearance, Chats, Storage & Data, Help, Invite Friends
- [x] Mỗi section: icon + title + description + arrow
- [x] Sub-pages với nội dung chi tiết (ít nhất Account và Appearance phải có nội dung thật)

#### 1.12. Routing & navigation ✅

- [x] Setup route groups `(chat)` với layout chung (sidebar + panels)
- [x] URL state cho panel nào đang mở (`?panel=info`)
- [x] Active conversation trong URL `/chats/[id]`

#### 1.13. Polish ✅

- [x] Animations (panel slide, message fade in)
- [x] Loading states
- [x] Empty states
- [x] Error boundaries

### Deliverable ✅

- Toàn bộ UI giống template, navigation hoạt động, dark/light mode mượt
- Mock data hiển thị đúng
- Responsive cơ bản

---

## Phase 2 — Authentication & Real Database 🗄️ ✅

**Mục tiêu**: Kết nối Supabase, thay thế mock data bằng data thật, có auth thực sự.
**Trạng thái**: ✅ Hoàn thành (2026-08-23)

### Tasks

#### 2.1. Supabase setup ✅

- [x] Tạo project Supabase
- [x] Setup `.env.local` với keys
- [x] `supabase init` và `supabase start` local
- [x] Cài `@supabase/ssr`, `@supabase/supabase-js`
- [x] Tạo `lib/supabase/{client,server,middleware}.ts`

#### 2.2. Auth flow ✅

- [x] Middleware refresh session
- [x] Login page (email + OAuth buttons)
- [x] Register page
- [x] Magic link flow
- [x] OAuth callback handler
- [x] Logout
- [x] Protected routes (redirect to login)

#### 2.3. Database migrations ✅

- [x] Chạy các migrations từ docs/02-database.md
- [x] Generate TypeScript types từ Supabase
- [x] Seed data cho dev environment

#### 2.4. Thay mock bằng real data ✅

- [x] Hook `useCurrentUser()` đổi sang `supabase.auth.getUser()`
- [x] Conversations list từ `conversations` table
- [x] Messages từ `messages` table
- [x] Server Actions cho mutations

#### 2.5. Profile setup ✅

- [x] Onboarding sau khi đăng ký (tên, avatar)
- [x] User settings persist vào `profiles`

### Deliverable ✅

- User đăng ký/đăng nhập được
- Conversations và messages lưu vào Postgres
- Còn chưa realtime (Phase 3)

---

## Phase 3 — Realtime Messaging ⚡ ✅

**Mục tiêu**: Tin nhắn đến realtime, typing indicators, online status, read receipts.

### Tasks

#### 3.1. Realtime messages ✅

- [x] Hook `useRealtimeMessages(conversationId)`
- [x] Subscribe broadcast channel `room:${conversationId}`
- [x] Optimistic update khi gửi
- [x] Server Action `sendMessage` → broadcast sau khi insert
- [x] Hiển thị tin nhắn mới cuối list + auto-scroll

#### 3.2. Online status ✅

- [x] Presence channel `user:${userId}`
- [x] Hiển thị online/offline real-time
- [x] Last seen

#### 3.3. Typing indicator ✅

- [x] Broadcast `typing:{start,stop}` event
- [x] Debounce input
- [x] Hiển thị "Sarah is typing..." ở header chat

#### 3.4. Read receipts ✅

- [x] Update `last_read_at` khi mở conversation
- [x] Broadcast `read:${messageId}` event
- [x] Đổi ✓✓ → ✓✓ xanh khi người nhận đọc

#### 3.5. Unread counts ✅

- [x] Badge trên sidebar item
- [x] Badge tổng trên sidebar icon Chats
- [x] Cập nhật realtime

### Deliverable ✅

- Chat realtime hoàn chỉnh như WhatsApp/Telegram
- 2 user test thử trên 2 browser khác nhau

---

## Phase 4 — Rich Features 🚀 ✅

**Mục tiêu**: Media, search, notifications, nâng cao UX.
**Trạng thái**: ✅ Hoàn thành (2026-08-27)

### Tasks

#### 4.1. Media & Files ✅

- [x] Upload ảnh/file qua Supabase Storage
- [x] Preview trong chat
- [x] Media gallery trong Info Panel
- [x] File size limit, validation

#### 4.2. Search ✅

- [x] Global search (tên, nội dung message)
- [x] Full-text search với Postgres `tsvector`
- [x] Filter by sender, date

#### 4.3. Notifications ✅

- [x] Push notifications (Web Push API)
- [x] In-app notification center
- [x] Notification preferences trong Settings

#### 4.4. Message features ✅

- [x] Reply to message
- [x] Edit message
- [x] Delete message (soft delete)
- [x] Forward message
- [x] Reactions (emoji)
- [x] Star/Pin message

#### 4.5. Conversation management ✅

- [x] Archive conversations (with Archived tab)
- [x] Pin/Unpin conversation
- [x] Mute/Unmute conversation
- [x] Block user (from message context menu)
- [x] Unblock user (from Blocked Users modal)
- [x] Delete conversation (leave conversation)
- [x] Clear conversation history (soft delete own messages)
- [x] Filter blocked users from conversations list

#### 4.6. Scheduled Messages, Drafts & Labels ✅ (2026-08-27)

- [x] **Scheduled Messages**: Schedule picker với tùy chọn thời gian (30m, 1h, Tomorrow, Custom)
- [x] **Auto-send**: Client polling (30s) + pg_cron (1 phút) cho scheduled messages
- [x] **Draft Messages**: Auto-save/restore với Zustand store
- [x] **Conversation Labels**: Label manager modal, filter by label trong sidebar
- [x] **Database**: Bảng `scheduled_messages`, `conversation_labels`, `conversation_label_map`
- [x] **Realtime sync**: Labels sync khi thay đổi

#### 4.7. Voice & Video call (UI only) ✅ (2026-08-27)

- [x] **Call Store**: Zustand store với state management (calling, ringing, connected, ended)
- [x] **Incoming Call Modal**: Ringing UI với Accept/Decline buttons
- [x] **Call Screen**: Full-screen call UI với avatar, duration timer
- [x] **In-call Controls**: Mute mic, toggle camera, speaker toggle, end call
- [x] **Call Initiation**: Nút Phone/Video trong chat header kích hoạt call
- [x] **Local Video Preview**: Picture-in-picture cho video calls
- [x] **Duration Timer**: Format MM:SS khi call connected

### Deliverable

- App feature-rich như các messenger phổ biến

---

## Phase 5 — Voice & Video Call (WebRTC) 📞 ✅

**Mục tiêu**: Cuộc gọi thoại và video thực sự hoạt động.
**Trạng thái**: ✅ Hoàn thành implementation và nghiệm thu tự động hai browser (2026-09-01)

### Tasks

#### 5.1. Database Schema ✅

- [x] Migration `20250105000000_webrtc_calls.sql`
- [x] Bảng `call_sessions` với WebRTC signaling data (offer_sdp, answer_sdp, ice_candidates)
- [x] Bảng `call_history` cho lịch sử cuộc gọi
- [x] RPC functions: `initiate_call()`, `update_call_status()`, `end_call()`, `get_call_history()`
- [x] RLS policies cho phép caller/callee xem và update session
- [x] Realtime enabled trên `call_sessions` để nhận incoming calls
- [x] Auto-end missed calls sau 60 giây

#### 5.2. WebRTC Service ✅

- [x] `lib/webrtc.ts` - WebRTCService class quản lý RTCPeerConnection
- [x] Signaling qua Supabase Realtime broadcast channels
- [x] STUN servers: Google public STUN servers
- [x] Media controls: mute mic, toggle camera, switch camera
- [x] ICE candidate handling và exchange
- [x] Kiểm tra hỗ trợ WebRTC mà không tự mở camera/microphone khi tải trang

#### 5.3. Call Provider & Hooks ✅

- [x] `hooks/use-webrtc-call.ts` - Hook quản lý WebRTC lifecycle
- [x] `hooks/use-call-history.ts` - Hook fetch và subscribe call history
- [x] `components/calls/call-provider.tsx` - Provider wrap app để quản lý calls
- [x] Event-based communication: `call:initiate`, `call:accept`, `call:decline`, `call:end`

#### 5.4. UI Integration ✅

- [x] Cập nhật `call-screen.tsx` với remote stream video display
- [x] Cập nhật `incoming-call-modal.tsx` với real accept/decline
- [x] Cập nhật `chat-view.tsx` dispatch events thay vì gọi store trực tiếp
- [x] Wrap app với `CallProvider` trong `(chat)/layout.tsx`
- [x] Cập nhật `calls/page.tsx` sử dụng `useCallHistory` thay vì mock data

#### 5.5. Call History ✅

- [x] Group calls by date
- [x] Filter: All, Missed, Incoming, Outgoing
- [x] Realtime updates khi có cuộc gọi mới

#### 5.6. Signaling & Media Hardening ✅ (2026-09-01)

- [x] Nút Accept/Decline gọi đúng provider thay vì chỉ đổi Zustand state
- [x] Đọc đúng `id` từ object trả về của RPC `initiate_call()`
- [x] Callee subscribe signaling trước khi cập nhật trạng thái `answered`
- [x] Queue ICE candidates đến khi có remote description
- [x] Không gọi `getUserMedia()` khi ứng dụng vừa mount
- [x] Sửa logic mute/camera bị đảo và nối đúng nút switch camera
- [x] Gắn remote audio/video stream và có fallback click để vượt autoplay policy
- [x] Bổ sung TURN config, authorization và call-history idempotency
- [x] Sửa enum `call_direction` để kết thúc cuộc gọi ghi lịch sử nguyên tử
- [x] Cô lập timer của từng session để cuộc gọi cũ không ghi đè cuộc gọi kế tiếp
- [x] Giữ listener provider ổn định qua các lần thay đổi local/remote stream

### Deliverable ✅

- [x] Nghiệm thu gọi thoại hai chiều giữa 2 user trên hai browser độc lập với audio track live
- [x] Nghiệm thu video hai chiều và camera preview với audio/video track live
- [x] Lịch sử cuộc gọi được lưu một lần cho mỗi session
- [ ] Smoke test bổ sung trên hai thiết bị vật lý và mạng TURN của môi trường triển khai

---

## Phase 6 — Friendships, Public Profiles & Administration 👥 ✅

**Mục tiêu**: Bổ sung social graph và công cụ quản trị có phân quyền.
**Trạng thái**: ✅ Hoàn thành implementation và migration (2026-09-01)

### Tasks

- [x] Gửi, nhận, chấp nhận, từ chối và hủy lời mời kết bạn
- [x] Hủy kết bạn và đồng bộ Realtime
- [x] Trang hồ sơ công khai `/profile/[id]`
- [x] Chỉ hiển thị hành động phù hợp với trạng thái quan hệ
- [x] Trang `/admin` với thống kê, tìm kiếm và quản lý user
- [x] Role admin, khóa/mở tài khoản, chống tự nâng quyền và audit log
- [x] Tài khoản admin test được bootstrap ngoài source code
- [x] Xóa vĩnh viễn cuộc trò chuyện bằng RPC có kiểm tra quyền

### Deliverable ✅

- Social graph và trang quản trị hoạt động trên Supabase thật

---

## Phase 7 — Group Chat, Stories, Polish ✨

**Mục tiêu**: Mở rộng cho nhóm và status, polish cuối cùng.

### Tasks

- [ ] Group chat (tạo, mời, rời nhóm)
- [ ] Group admin permissions
- [ ] Status/Story (24h tự xóa)
- [ ] PWA (install như native app)
- [ ] Mobile responsive hoàn chỉnh
- [ ] E2E test coverage
- [ ] Performance optimization
- [ ] Accessibility audit

### Deliverable

- App hoàn chỉnh production-ready

---

## Tiêu chí "Done" cho mỗi phase

Phase X được tính là xong khi:

1. ✅ Tất cả tasks trong phase đó ✅
2. ✅ Có demo được (screenshot/video)
3. ✅ Code đã review và merge vào main branch
4. ✅ Docs đã cập nhật ([docs/07-changelog.md](docs/07-changelog.md))
5. ✅ Không có bug blocker
6. ✅ TypeScript không lỗi, ESLint sạch
