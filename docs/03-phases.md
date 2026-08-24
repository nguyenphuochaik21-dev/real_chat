# 03 - Roadmap & Phases

## Tổng quan

Dự án chia thành **6 phases** rõ ràng. Mỗi phase có deliverable cụ thể, có thể demo độc lập.

---

## Phase 0 — Setup & Planning ⏳ (ĐANG LÀM)

**Mục tiêu**: Chuẩn bị mọi thứ trước khi code.

### Tasks
- [x] Nghiên cứu stack (Next.js 16 + Supabase)
- [x] Viết CLAUDE.md và docs/
- [x] Tạo agents và skills tùy chỉnh
- [ ] User duyệt kế hoạch tổng thể
- [ ] Tạo Next.js 16 project (create-next-app)
- [ ] Cài đặt dependencies (Tailwind, shadcn, Supabase client)
- [ ] Setup ESLint, Prettier, Husky
- [ ] Tạo repo git và push initial commit

### Deliverable
- Project skeleton chạy được `npm run dev`
- Tất cả docs files được viết xong
- Git history sạch

---

## Phase 1 — UI đầy đủ với Mock Data 🎨

**Mục tiêu**: Toàn bộ giao diện giống template, dùng mock data cứng.

### Tasks

#### 1.1. Setup UI foundation
- [ ] Setup Tailwind v4 với design tokens
- [ ] Setup next-themes cho dark/light mode
- [ ] Cài shadcn/ui: button, input, dropdown-menu, dialog, avatar, badge, tooltip, scroll-area, separator, switch, tabs
- [ ] Tạo design tokens file (colors, spacing, typography)
- [ ] Tạo layout root với theme provider

#### 1.2. Mock data layer
- [ ] Tạo `lib/mock/users.ts` — 10 user mẫu với avatar, online status, etc.
- [ ] Tạo `lib/mock/conversations.ts` — 8 conversations
- [ ] Tạo `lib/mock/messages.ts` — 50+ messages với timestamps
- [ ] Tạo `lib/mock/calls.ts` — call history
- [ ] Tạo `lib/mock/status.ts` — status updates
- [ ] Helper hook `useCurrentUser()` trả về user giả lập

#### 1.3. Sidebar (left navigation)
- [ ] Component `Sidebar` với logo + nav items
- [ ] Icons: chat, contacts, calls, favorites, status, settings
- [ ] Active state highlight
- [ ] User avatar ở dưới cùng với menu
- [ ] Mobile: collapse thành bottom nav (optional cho Phase 1)

#### 1.4. Chats list (panel thứ 2)
- [ ] Component `ChatsListPanel`
- [ ] Search input ở top
- [ ] Tabs: All / Unread / Groups / Personal
- [ ] Conversation item: avatar + tên + last message + time + unread badge + pin icon
- [ ] Pinned conversations ở trên cùng
- [ ] Empty state khi không có chat

#### 1.5. Chat view (panel thứ 3)
- [ ] Component `ChatView`
- [ ] Header: avatar + tên + online status + actions (call, video, search, menu)
- [ ] Date separator ("Saturday, Aug 22")
- [ ] Message bubble: incoming (trái, trắng) vs outgoing (phải, indigo)
- [ ] Message status: sent (✓) / delivered (✓✓) / read (✓✓ xanh)
- [ ] Avatar cho từng message incoming
- [ ] Chat input ở dưới: emoji button + input + send button
- [ ] Auto-scroll to bottom

#### 1.6. Info panel (panel thứ 4 - mở rộng)
- [ ] Component `InfoPanel` với gradient header
- [ ] Avatar lớn + tên + status
- [ ] Action buttons: Call, Video, Mute, Search
- [ ] About section (bio)
- [ ] Phone, Email sections
- [ ] Media & Files grid (6 ô màu: image, video, pdf, ...)
- [ ] Groups in Common
- [ ] Notification toggle
- [ ] Close button (X)

#### 1.7. Contacts page
- [ ] List contacts theo alphabet với letter headers (A, D, E, L, M, S)
- [ ] Search bar
- [ ] Action icons (call, message)
- [ ] Online indicator

#### 1.8. Calls page
- [ ] Tabs: All / Missed / Incoming / Outgoing
- [ ] Call item: avatar + tên + time + duration + call type icon (video/voice)
- [ ] Filter

#### 1.9. Favorites page
- [ ] List starred contacts với star icon bên phải

#### 1.10. Status page
- [ ] "My Status" ở trên với "+" add button
- [ ] Recent updates list (status mới nhất)
- [ ] Seen status

#### 1.11. Settings page
- [ ] Profile card ở trên (avatar, tên, bio, QR)
- [ ] Sections: Account, Notifications, Appearance, Chats, Storage & Data, Help, Invite Friends
- [ ] Mỗi section: icon + title + description + arrow
- [ ] Sub-pages với nội dung chi tiết (ít nhất Account và Appearance phải có nội dung thật)

#### 1.12. Routing & navigation
- [ ] Setup route groups `(chat)` với layout chung (sidebar + panels)
- [ ] URL state cho panel nào đang mở (`?panel=info`)
- [ ] Active conversation trong URL `/chats/[id]`

#### 1.13. Polish
- [ ] Animations (panel slide, message fade in)
- [ ] Loading states
- [ ] Empty states
- [ ] Error boundaries

### Deliverable
- Toàn bộ UI giống template, navigation hoạt động, dark/light mode mượt
- Mock data hiển thị đúng
- Responsive cơ bản

---

## Phase 2 — Authentication & Real Database 🗄️

**Mục tiêu**: Kết nối Supabase, thay thế mock data bằng data thật, có auth thực sự.

### Tasks

#### 2.1. Supabase setup
- [ ] Tạo project Supabase
- [ ] Setup `.env.local` với keys
- [ ] `supabase init` và `supabase start` local
- [ ] Cài `@supabase/ssr`, `@supabase/supabase-js`
- [ ] Tạo `lib/supabase/{client,server,middleware}.ts`

#### 2.2. Auth flow
- [ ] Middleware refresh session
- [ ] Login page (email + OAuth buttons)
- [ ] Register page
- [ ] Magic link flow
- [ ] OAuth callback handler
- [ ] Logout
- [ ] Protected routes (redirect to login)

#### 2.3. Database migrations
- [ ] Chạy các migrations từ docs/02-database.md
- [ ] Generate TypeScript types từ Supabase
- [ ] Seed data cho dev environment

#### 2.4. Thay mock bằng real data
- [ ] Hook `useCurrentUser()` đổi sang `supabase.auth.getUser()`
- [ ] Conversations list từ `conversations` table
- [ ] Messages từ `messages` table
- [ ] Server Actions cho mutations

#### 2.5. Profile setup
- [ ] Onboarding sau khi đăng ký (tên, avatar)
- [ ] User settings persist vào `profiles`

### Deliverable
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

## Phase 4 — Rich Features 🚀

**Mục tiêu**: Media, search, notifications, nâng cao UX.

### Tasks

#### 4.1. Media & Files
- [ ] Upload ảnh/file qua Supabase Storage
- [ ] Preview trong chat
- [ ] Media gallery trong Info Panel
- [ ] File size limit, validation

#### 4.2. Search
- [ ] Global search (tên, nội dung message)
- [ ] Full-text search với Postgres `tsvector`
- [ ] Filter by sender, date

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

#### 4.5. Conversation management
- [ ] Archive, Pin, Mute
- [ ] Block user
- [ ] Delete conversation
- [ ] Clear history

#### 4.6. Voice & Video call (UI only, Phase 5 mới gọi thật)
- [ ] Call screen UI
- [ ] WebRTC peer connection foundation

### Deliverable
- App feature-rich như các messenger phổ biến

---

## Phase 5 — Voice & Video Call 📞

**Mục tiêu**: Cuộc gọi thoại và video thực sự hoạt động.

### Tasks
- [ ] WebRTC signaling qua Supabase Realtime
- [ ] Microphone/camera permission
- [ ] In-call controls (mute, video toggle, end)
- [ ] Group call (optional)
- [ ] Call history persist

### Deliverable
- Gọi được giữa 2 user

---

## Phase 6 — Group Chat, Stories, Polish ✨

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
