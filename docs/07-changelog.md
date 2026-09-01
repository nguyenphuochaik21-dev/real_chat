# 07 - Changelog các quyết định

> File này ghi lại **quyết định kiến trúc quan trọng** và lý do. Mỗi entry có ngày và người quyết định (AI/user).

## Format

```markdown
## [YYYY-MM-DD] Tiêu đề ngắn

**Quyết định**: Mô tả ngắn
**Lý do**: Tại sao chọn
**Hệ quả**: Ảnh hưởng tới code/docs nào
**Status**: Active | Superseded by [link]
```

---

## [2026-09-01] Phase 7 — Group Chat, PWA & Polish

**Quyết định**: Hoàn thiện group chat bằng RPC có phân quyền, bổ sung PWA/offline, đồng thời
đưa responsive, accessibility, hiệu năng và E2E vào release gate.

**Lý do**: Group mutation nhiều bước ở client dễ tạo dữ liệu dở dang hoặc vượt quyền; ứng dụng
cũng thiếu manifest/offline shell và kiểm thử tự động cho các viewport chính.

**Hệ quả**:

- Migrations `20260901070000`–`20260901090000` thêm vai trò `owner/admin/member`, group RPC
  nguyên tử, owner transfer khi rời nhóm, khóa legacy mutation path và conversation summary RPC
  để loại bỏ N+1 query.
- Chat list, search, forwarding, header, message sender và panel quản lý thành viên hỗ trợ nhóm.
- Thêm manifest, icon PNG sinh bằng `ImageResponse`, offline route, đăng ký service worker và install prompt.
- Hoàn thiện safe-area mobile, reduced motion, contrast WCAG, dialog/live-region semantics và tối ưu ảnh.
- Thêm Playwright + Axe; 6 bài public đạt trên desktop/mobile, bài mutation nhóm có guard credentials.
- ESLint đạt 0 error, TypeScript strict đạt và Next.js production build sinh đủ 18 route.

**Status**: Active

## [2026-09-01] WebRTC, social graph và messaging hardening

**Quyết định**: Nghiệm thu lại Phase 5 theo hành vi thực tế, đồng thời thêm friendships,
public profiles và role-protected administration bằng migration append-only.

**Lý do**: Luồng cũ bật webcam khi mount, làm mất offer/ICE do race condition và nút Accept
không khởi tạo WebRTC. Ứng dụng cũng chưa có mô hình bạn bè hoặc công cụ quản trị an toàn.

**Hệ quả**:

- Signaling chỉ bắt đầu sau thao tác gọi/chấp nhận; callee subscribe trước khi caller tạo offer.
- ICE được queue, media controls dùng đúng trạng thái, remote playback có autoplay fallback.
- Thêm migrations `20260901000000` đến `20260901060000` cho xóa hội thoại, friendships,
  administration, call hardening, dọn call treo và friendship Database Broadcast.
- Thêm `/profile/[id]`, `/admin`, trang tài khoản bị khóa và Contacts dựa trên friendships.
- Chuyển Next.js convention từ `middleware.ts` sang `proxy.ts` theo tài liệu Next.js 16.
- Phase 5 đã qua E2E production-build với hai tài khoản/browser: không mở media khi tải trang,
  voice có remote audio live và video có remote audio/video live ở cả hai phía.
- Timer và listener cuộc gọi được cô lập theo session để gọi liên tiếp không làm mất incoming call.
- Phiên `pending/ringing` quá 60 giây được chuyển sang `missed`; đăng nhập/F5 không còn hiện cuộc gọi cũ.
- Badge lời mời kết bạn và trạng thái quan hệ của cả hai phía cập nhật Realtime không cần F5.
- Nhấp đúp/chạm đúp tin nhắn để thả tim; reaction bám góc dưới-phải và picker có thêm emoji/sticker.
- Xóa `/status`, mục điều hướng “Tin”, mock data và kế hoạch Stories theo quyết định sản phẩm.

**Status**: Active

## [2026-08-24] In-app Notification Center

**Quyết định**: Tạo notification system với 3 thành phần: bell icon, toast popup, notification center panel.
**Lý do**: Người dùng cần biết khi có message mới từ conversation khác mà không cần rời khỏi tab hiện tại.
**Hệ quả**:

- Tạo `stores/notification-store.ts` (Zustand)
- Tạo `hooks/use-notifications.ts`
- Tạo `components/notifications/` (bell, toast, center, item)
- Sidebar tích hợp notification subscription
- Utils thêm `formatDistanceToNow()`
  **Status**: Active

## [2026-08-22] Stack chính thức: Next.js 16 + Supabase

**Quyết định**: Dùng Next.js 16 với App Router làm frontend framework, Supabase làm backend (Postgres + Auth + Realtime + Storage).
**Lý do**: Next.js 16 cho performance tốt với Server Components, Server Actions giảm boilerplate API. Supabase tích hợp nhanh, có row-level security mạnh, free tier đủ dùng cho MVP.
**Hệ quả**: Toàn bộ docs và code structure thiết kế theo pattern này.
**Status**: Active

## [2026-08-22] Phase 1 = UI đầy đủ với mock data

**Quyết định**: Giai đoạn đầu xây toàn bộ UI giống template với mock data cứng, chưa kết nối Supabase.
**Lý do**: Cho phép iterate UI nhanh mà không bị block bởi backend setup. User có thể review giao diện trước khi đầu tư vào backend.
**Hệ quả**: Tạo `lib/mock/` riêng, tất cả components ban đầu đọc từ đây. Phase 2 sẽ swap sang Supabase queries.
**Status**: Active

## [2026-08-22] Auth: hỗ trợ cả 3 phương thức

**Quyết định**: Login page hỗ trợ email/password, magic link, OAuth Google + GitHub.
**Lý do**: User đa dạng, một số thích OAuth nhanh, số khác thích email/password để có toàn quyền.
**Hệ quả**: Login UI có nhiều section. Server actions cho cả 3 flow. Tốn công hơn nhưng đúng product expectation.
**Status**: Active

## [2026-08-22] Phase 1 chỉ text, không media

**Quyết định**: Phase 1 chỉ gửi text + emoji. File/ảnh để Phase 4.
**Lý do**: Tập trung vào UI foundation trước. Media cần storage setup, validation, preview logic.
**Hệ quả**: Chat input Phase 1 chỉ có emoji + textarea + send. Không có paperclip button hoặc sẽ có nhưng disabled.
**Status**: Active

## [2026-08-22] Zustand cho UI state, không cho server state

**Quyết định**: Zustand chỉ dùng cho UI ephemeral state (sidebar collapse, drafts, theme override). Server state qua Supabase + RSC.
**Lý do**: Tránh duplicate cache, giữ single source of truth. Zustand nhẹ, đủ dùng cho UI state.
**Hệ quả**: Ít store hơn. Hầu hết data flow qua Supabase trực tiếp.
**Status**: Active

## [2026-08-22] Folder structure: route groups + feature folders

**Quyết định**: Dùng `(auth)` và `(chat)` route groups, components chia theo feature (chat/, contacts/, settings/...).
**Lý do**: Route groups cho phép khác layout mà không ảnh hưởng URL. Feature folders scale tốt khi app lớn.
**Hệ quả**: Cấu trúc rõ ràng, dễ tìm file theo feature.
**Status**: Active

## [2026-08-22] Routing pattern: panel qua URL state

**Quyết định**: Info panel mở/đóng qua search param (vd: `?panel=info`). Active conversation qua path (`/chats/[id]`).
**Lý do**: Cho phép deep link, browser back/forward hoạt động đúng, share URL được.
**Hệ quả**: Logic mở/đóng panel đọc từ searchParams.
**Status**: Active

---

## [2026-08-23] Phase 2 bắt đầu - Auth & Database infrastructure

**Quyết định**: Implement Supabase auth flow và database setup cho Phase 2.
**Lý do**: Chuẩn bị infrastructure trước khi chuyển mock data sang real data.
**Hệ quả**:

- Tạo `lib/supabase/client.ts`, `server.ts`, `middleware.ts`
- Tạo 6 migration files cho database schema
- Tạo auth pages: login, register, callback
- Tạo Server Actions cho auth, profile, conversations, messages
- Tạo hooks: `use-auth.ts`, `use-profile.ts`
- Update Sidebar để load real profile
  **Status**: Active

---

## [2026-08-23] Phase 2 hoàn thành - Auth & Real Database

**Quyết định**: Hoàn thành việc thay thế mock data bằng real data từ Supabase.
**Lý do**: User đã setup Supabase và push migrations thành công.
**Hệ quả**:

- `ChatsList` fetch conversations từ Supabase
- `ChatView` fetch messages + realtime subscription + send message
- `ContactsPage` load contacts + start new conversation
- `Settings` pages load/save profile từ Supabase
- `Sidebar` load user profile
- Tạo hooks: `use-conversations.ts`, `use-messages.ts`, `use-contacts.ts`
- Realtime subscription cho messages (postgres_changes)
  **Status**: Active

---

## [2026-08-23] Fix RLS cho create conversation

**Quyết định**: Sửa RLS policy và thêm RPC function để cho phép creator conversation thêm participants.
**Lý do**: User báo lỗi "Failed to create conversation" khi click vào contact. Nguyên nhân: RLS policy `"Users can join conversations"` chỉ cho phép `user_id = auth.uid()` insert, không cho phép insert người khác.
**Hệ quả**:

- Migration `20250101000007_fix_rls_for_new_conversation.sql` - Cập nhật RLS + tạo RPC `add_conversation_participant`
- Update `startConversation` trong contacts page sử dụng RPC cho người thứ 2
- Update `createConversation` trong conversations actions sử dụng pattern tương tự
  **Status**: Active

---

## [2026-08-23] Phase 1 hoàn thành - UI đầy đủ với mock data

**Quyết định**: Hoàn thành toàn bộ UI giống template Chatly, sử dụng mock data cứng.
**Lý do**: Đạt mục tiêu MVP - giao diện đầy đủ có thể demo được.
**Hệ quả**:

- Tạo 10 mock users, 8 conversations, 30+ messages, 8 calls, 5 statuses
- UI components: Avatar, Button, Input, Badge, ScrollArea, Separator
- Pages: Chats, Contacts, Calls, Favorites, Status, Settings (Profile, Appearance)
- Dark/Light mode hoạt động
- Animations và empty states
  **Status**: Active

---

## [2026-08-23] Phase 3 bắt đầu - Realtime Messaging

**Quyết định**: Implement các tính năng realtime nâng cao: presence, typing indicators, read receipts.
**Lý do**: Để chat app hoạt động như messenger thực sự, cần realtime updates.
**Hệ quả**:

- Tạo `use-presence.ts` - Supabase Presence API để track online/offline
- Tạo `use-typing.ts` - Broadcast typing events với debounce
- Tạo `use-read-receipts.ts` - Track read receipts và broadcast
- Cập nhật `Avatar` component với `statusOverride` prop
- Cập nhật `ChatView` để hiển thị typing indicator và read status
- Cập nhật `ChatsList` để hiển thị online status của participants
- Tạo migration `20250101000010_add_presence_and_read_receipts.sql`
  **Status**: Active

---

## [2026-08-23] Phase 4.1 bắt đầu - Media & Files

**Quyết định**: Implement upload và preview media files (images, videos, audio, documents).
**Lý do**: Chat app cần gửi được ảnh, file để cạnh tranh với các messenger phổ biến.
**Hệ quả**:

- Migration `20250101000015_add_media_support.sql` - Thêm columns: content_type, media_url, media_name, media_size, media_mime_type
- Tạo Supabase Storage bucket `chat-media` với 50MB limit
- Tạo `lib/supabase/storage.ts` - Upload, delete, validation utilities
- Tạo `hooks/use-media-upload.ts` - Hook xử lý upload với progress
- Tạo `components/chat/media-message-bubble.tsx` - Render image/video/audio/file messages
- Tạo `components/chat/media-attachment-button.tsx` - Button group cho upload
- Cập nhật `types/database.ts` với media columns
- Cập nhật `ChatView` tích hợp media upload và display
- Sidebar badge cho unread count (Phase 3 completion)
  **Status**: Active

---

## [2026-08-24] Thêm Media Gallery Viewer

**Quyết định**: Implement modal xem tất cả media files trong một conversation.
**Lý do**: Người dùng cần xem lại tất cả ảnh/files đã chia sẻ.
**Hệ quả**:

- Tạo `hooks/use-conversation-media.ts` - Fetch media từ conversation
- Tạo `components/chat/media-gallery.tsx` - Gallery component + viewer modal
- Tích hợp nút Image trong header chat để mở gallery
- Viewer có tabs: All, Images, Videos, Audio, Files
  **Status**: Active

---

## [2026-08-24] Phase 4.2 bắt đầu - Search (Global search, full-text search)

**Quyết định**: Implement global search cho messages và contacts với full-text search capabilities.
**Lý do**: Người dùng cần tìm kiếm nhanh tin nhắn cũ hoặc bắt đầu cuộc trò chuyện mới với ai đó.
**Hệ quả**:

- Migration `20250101000016_add_search_support.sql` - Thêm tsvector column + GIN index + search function
- Tạo `lib/actions/search.ts` - Server Actions cho searchMessages và searchConversations
- Tạo `hooks/use-search.ts` - Hook với debounce và pagination
- Tạo `components/chat/search-modal.tsx` - Modal với 2 tabs: Messages và Contacts
- Cập nhật `Sidebar` thêm nút Search và tích hợp SearchModal
- Search hỗ trợ filter theo ngày
  **Status**: Active

---

## [2026-08-27] Phase 4.6 - Scheduled Messages, Drafts & Labels

**Quyết định**: Implement 3 tính năng nâng cao UX: scheduled messages, draft messages, và conversation labels.
**Lý do**: Người dùng cần có thể hẹn giờ gửi tin nhắn, lưu nháp tự động, và tổ chức cuộc trò chuyện bằng nhãn.

### Scheduled Messages

**Hệ quả**:

- Migration `20250103000000_scheduling_labels.sql` - Tạo bảng `scheduled_messages`
- Migration `20250104000000_pg_cron_scheduled_messages.sql` - pg_cron function `send_scheduled_messages()`
- `hooks/use-scheduled-messages.ts` - Hook quản lý scheduled messages
- `hooks/use-scheduled-messages-processor.ts` - Client-side processor (30s polling)
- `lib/actions/scheduled-messages.ts` - Server Actions
- `components/chat/schedule-picker.tsx` - Schedule picker UI với tùy chọn: 30m, 1h, Tomorrow 9AM, Custom

### Draft Messages

**Hệ quả**:

- `stores/draft-store.ts` - Zustand store cho drafts
- `hooks/use-draft-store.ts` - Hook truy cập draft store
- Auto-save khi typing (debounced)
- Auto-restore khi quay lại conversation
- Hiển thị "Draft: ..." trong chats list

### Conversation Labels

**Hệ quả**:

- Tạo bảng `conversation_labels` và `conversation_label_map`
- `lib/actions/labels.ts` - Server Actions cho CRUD labels
- `hooks/use-conversation-labels.tsx` - Context provider + useConversationLabels hook
- `components/chat/label-manager.tsx` - Label manager modal UI
- Filter by label trong sidebar
- Realtime sync khi labels thay đổi

### Bugs Fixed

- Realtime subscription duplicate channel errors (lazy initialization)
- Type cast error: `content_type::message_content_type`
- pg_cron function auto-send khi tab đóng

**Status**: Active

---

## [2026-08-27] Phase 4.7 - Voice & Video Call UI

**Quyết định**: Implement Voice & Video Call UI với Zustand store và React components.
**Lý do**: Phase 5 sẽ implement WebRTC thực sự, Phase 4.7 là UI foundation.

### Hệ quả:

- `stores/call-store.ts` - Zustand store với state: idle/calling/ringing/connected/ended/declined/missed
- `components/calls/call-screen.tsx` - Full-screen call UI với gradient background, avatar, controls
- `components/calls/incoming-call-modal.tsx` - Modal với Accept/Decline buttons, pulse animation
- Tích hợp CallScreen/IncomingCallModal vào `(chat)/layout.tsx`
- Phone/Video buttons trong chat header gọi `initiateCall()` từ call store
- Call controls: mute mic, toggle camera, speaker toggle, end call
- Duration timer với format MM:SS
- Local video preview (picture-in-picture) cho video calls

**Status**: Active

---

## [2026-08-27] Phase 5 - WebRTC Voice & Video Calls

**Quyết định**: Implement WebRTC thực sự cho cuộc gọi voice/video giữa 2 users.
**Lý do**: Phase 4.7 đã có UI, Phase 5 cần integrate với WebRTC để cuộc gọi hoạt động.

### Database Schema

**Hệ quả**:

- Migration `20250105000000_webrtc_calls.sql` - Tạo bảng `call_sessions` và `call_history`
- Enums: `call_type` (voice/video), `call_direction` (incoming/outgoing), `call_session_status`
- RPC functions: `initiate_call()`, `update_call_status()`, `end_call()`, `get_call_history()`
- RLS policies cho phép caller/callee xem và update session
- Realtime enabled trên `call_sessions` để nhận incoming calls

### WebRTC Service

**Hệ quả**:

- `lib/webrtc.ts` - WebRTCService class quản lý RTCPeerConnection
- Signaling qua Supabase Realtime broadcast channels
- STUN servers: Google public STUN servers
- Media controls: mute mic, toggle camera, switch camera
- ICE candidate handling

### Call Provider & Hooks

**Hệ quả**:

- `hooks/use-webrtc-call.ts` - Hook quản lý WebRTC lifecycle
- `hooks/use-call-history.ts` - Hook fetch và subscribe call history
- `components/calls/call-provider.tsx` - Provider wrap app để quản lý calls
- Event-based communication: `call:initiate`, `call:accept`, `call:decline`, `call:end`, etc.

### UI Updates

**Hệ quả**:

- Cập nhật `call-screen.tsx` với remote stream video display
- Cập nhật `incoming-call-modal.tsx` với real accept/decline
- Cập nhật `chat-view.tsx` dispatch events thay vì gọi store trực tiếp
- Cập nhật `(chat)/layout.tsx` wrap với CallProvider
- Cập nhật `calls/page.tsx` sử dụng `useCallHistory` thay vì mock data

### Types & Utilities

**Hệ quả**:

- Cập nhật `types/database.ts` với call_sessions và call_history tables
- Thêm enums: call_type, call_direction, call_session_status
- Helper functions: `isWebRTCSupported()`, `requestMediaPermissions()`

**Status**: Active
