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
