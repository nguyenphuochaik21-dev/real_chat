# Chatly Project Brain

Đây là file bộ não tổng hợp của dự án Chatly. Mục tiêu là cho Claude/AI agent đọc ngay và hiểu đúng toàn bộ repo, không cần mất thời gian dò từng file.

## 1) Tổng quan ngắn

- Tên dự án: Chatly
- Loại: Real-time messaging app tương tự WhatsApp / Telegram
- Stack chính:
  - Next.js 16 (App Router)
  - React 19
  - Supabase (Postgres + Auth + Realtime + Storage)
  - TailwindCSS v4
  - shadcn/ui
  - Zustand
  - Zod
- Trạng thái hiện tại: Dự án đã đi từ UI mock sang app thực với auth, DB, realtime, call, notification, profile, conversation logic.

## 2) Cấu trúc workspace hiện tại

```text
real_chat/
├── CLAUDE.md                 # Hướng dẫn chung cho Claude ở root repo
├── PLAN.md                   # Kế hoạch / hướng phát triển dự án
├── docs/                     # Tài liệu kiến trúc, roadmap, conventions
│   ├── 00-overview.md
│   ├── 01-architecture.md
│   ├── 02-database.md
│   ├── 03-phases.md
│   ├── 04-ui-spec.md
│   ├── 05-api-routes.md
│   ├── 06-conventions.md
│   ├── 07-changelog.md
│   └── 08-tasks.md
├── memory/
│   └── chatly-brain-location.md
├── .claude/                  # Custom Claude setup / agents / skills
│   ├── agents/
│   └── skills/
├── chatly/                   # App chính của dự án
│   ├── AGENTS.md
│   ├── CLAUDE.md
│   ├── README.md
│   ├── PROGRESS.md
│   ├── SUPABASE_TROUBLESHOOTING.md
│   ├── package.json
│   ├── next.config.ts
│   ├── tsconfig.json
│   ├── eslint.config.mjs
│   ├── postcss.config.mjs
│   ├── public/
│   │   └── sw.js
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   ├── callback/
│   │   │   │   ├── login/
│   │   │   │   ├── register/
│   │   │   │   └── layout.tsx
│   │   │   ├── (chat)/
│   │   │   │   ├── chats/
│   │   │   │   ├── contacts/
│   │   │   │   ├── calls/
│   │   │   │   ├── settings/
│   │   │   │   ├── favorites/
│   │   │   │   ├── status/
│   │   │   │   ├── starred/
│   │   │   │   └── layout.tsx
│   │   │   ├── globals.css
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── components/
│   │   │   ├── calls/
│   │   │   ├── chat/
│   │   │   ├── layout/
│   │   │   ├── notifications/
│   │   │   ├── theme-provider.tsx
│   │   │   └── ui/
│   │   ├── hooks/
│   │   │   ├── use-auth.ts
│   │   │   ├── use-call-history.ts
│   │   │   ├── use-contacts.ts
│   │   │   ├── use-conversation-labels.tsx
│   │   │   ├── use-conversation-media.ts
│   │   │   ├── use-conversations.ts
│   │   │   ├── use-current-user.ts
│   │   │   ├── use-media-upload.ts
│   │   │   ├── use-messages.ts
│   │   │   ├── use-notifications.ts
│   │   │   ├── use-presence.ts
│   │   │   ├── use-profile.ts
│   │   │   ├── use-push-notifications.ts
│   │   │   ├── use-reactions.ts
│   │   │   ├── use-read-receipts.ts
│   │   │   ├── use-scheduled-messages.ts
│   │   │   ├── use-scheduled-messages-processor.ts
│   │   │   ├── use-search.ts
│   │   │   ├── use-signed-url.ts
│   │   │   ├── use-starred-messages.ts
│   │   │   ├── use-typing.ts
│   │   │   └── use-webrtc-call.ts
│   │   ├── lib/
│   │   │   ├── actions/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── block.ts
│   │   │   │   ├── conversations.ts
│   │   │   │   ├── labels.ts
│   │   │   │   ├── messages.ts
│   │   │   │   ├── presence.ts
│   │   │   │   ├── profile.ts
│   │   │   │   ├── scheduled-messages.ts
│   │   │   │   ├── search.ts
│   │   │   ├── mock/
│   │   │   ├── supabase/
│   │   │   │   ├── client.ts
│   │   │   │   ├── middleware.ts
│   │   │   │   ├── server.ts
│   │   │   │   └── storage.ts
│   │   │   ├── utils.ts
│   │   │   └── webrtc.ts
│   │   ├── stores/
│   │   │   ├── call-store.ts
│   │   │   ├── draft-store.ts
│   │   │   ├── message-actions-store.ts
│   │   │   └── notification-store.ts
│   │   ├── types/
│   │   │   ├── database.ts
│   │   │   └── index.ts
│   │   └── middleware.ts
│   └── supabase/
│       ├── .temp/
│       └── migrations/
│           ├── ... many SQL migration files ...
└──
```

## 3) Mục tiêu của dự án theo từng phase

Theo docs/03-phases.md:

### Phase 0 — Setup & Planning ✅
- Khởi tạo Next.js 16, config dự án, docs, agents, skills

### Phase 1 — UI full mock ✅
- Sidebar, chat UI, contacts, calls, settings, status, favorites

### Phase 2 — Authentication & real DB ✅
- Supabase auth, DB, server actions, profile, conversations

### Phase 3 — Realtime messaging ✅
- Tin nhắn realtime, typing, presence, read receipts, unread counts

### Phase 4 — Rich Features ✅
- Media, search, notifications, UX nâng cao

### Phase 5 — WebRTC Calls ✅
- Gọi thoại/video

### Phase 6 — Groups, Stories, Polish
- Chưa hoàn thành, còn open để phát triển tiếp

## 4) Kiến trúc hệ thống

### 4.1 Luồng dữ liệu chính

1. Server Components → Supabase Server Client → Postgres
2. Client Components → Supabase Browser Client → realtime events
3. Mutations → Server Actions → broadcast realtime updates
4. WebRTC calls → Supabase Realtime broadcast channel cho signaling

### 4.2 Quy tắc component

- Default: Server Components
- Chỉ dùng `'use client'` khi cần state/effect/browser API
- TypeScript strict mode
- Zod validate input
- Tailwind utility-first
- Zustand cho UI state tạm thời

### 4.3 Routing pattern

- `(auth)` – login, register, OAuth callback
- `(chat)` – app chính: chats, contacts, calls, settings
- `/chats/[id]` – conversation cụ thể
- URL query panel state như `?panel=info`

## 5) Vai trò từng folder chính

### `chatly/src/app/`
- Route app theo App Router của Next.js
- Chứa layout, auth pages, protected chat pages
- Là root routing UI của project

### `chatly/src/components/`
- UI thành phần dùng lại
- Phân theo chức năng: `chat`, `layout`, `calls`, `notifications`, `ui`
- Đây là nơi chứa phần lớn component giao diện

### `chatly/src/hooks/`
- Business logic và data access phía client
- Ví dụ: `use-messages.ts`, `use-conversations.ts`, `use-notifications.ts`, `use-webrtc-call.ts`
- Dùng để query, subscribe realtime, mutate state

### `chatly/src/lib/`
- Logic cốt lõi, utils, Supabase client, WebRTC, server actions
- `lib/actions/` chứa các server actions xử lý business logic
- `lib/mock/` chứa mock data dự án phase 1
- `lib/supabase/` chứa cấu hình auth + DB client

### `chatly/src/stores/`
- Zustand stores cho UI và state cross-component
- Ví dụ: `draft-store.ts`, `notification-store.ts`, `message-actions-store.ts`, `call-store.ts`

### `chatly/src/types/`
- Kiểu dữ liệu TypeScript, bao gồm database types từ Supabase

### `chatly/supabase/migrations/`
- SQL migrations cho schema DB
- Bao gồm profiles, conversations, participants, messages, reactions, typing, read receipts, presence, call sessions

## 6) Những file quan trọng cần đọc trước khi sửa

### Auth & DB
- `chatly/src/lib/supabase/client.ts` – browser client
- `chatly/src/lib/supabase/server.ts` – server-side client
- `chatly/src/lib/supabase/middleware.ts` – refresh session
- `chatly/src/middleware.ts` – route protection

### Chat logic
- `chatly/src/hooks/use-messages.ts` – logic message fetching/subscription
- `chatly/src/hooks/use-conversations.ts` – list conversation
- `chatly/src/hooks/use-typing.ts` – typing indicator
- `chatly/src/hooks/use-read-receipts.ts` – read state
- `chatly/src/hooks/use-reactions.ts` – reactions

### Actions
- `chatly/src/lib/actions/messages.ts`
- `chatly/src/lib/actions/conversations.ts`
- `chatly/src/lib/actions/profile.ts`
- `chatly/src/lib/actions/presence.ts`
- `chatly/src/lib/actions/search.ts`

### UI key components
- `chatly/src/components/chat/chat-view.tsx` – màn hình chat chính
- `chatly/src/components/chat/message-reactions.tsx` – reactions row
- `chatly/src/components/chat/reply-preview.tsx` – preview reply
- `chatly/src/components/layout/sidebar.tsx` – sidebar navigation
- `chatly/src/components/calls/call-provider.tsx` – call provider
- `chatly/src/components/notifications/notification-provider.tsx` – notification system

### App shell
- `chatly/src/app/(chat)/layout.tsx`
- `chatly/src/app/layout.tsx`

## 7) Dữ liệu chính trong hệ thống

### User model
- `profiles` table
- auth user + profile info + avatar + status

### Conversation model
- `conversations`
- `participants`
- unread state, pinned status, archived, muted flags

### Message model
- `messages` table
- Supports: text, media, replies, edits, deletions, reactions, scheduled send, read receipts

### Presence & notifications
- `presence` info per user
- `typing_indicators`
- push notification subscriptions
- notifications UI and store

## 8) Quy ước coding repo

### Naming
- Component: PascalCase
- Hook: `useXxx`
- Function: camelCase
- Constant: UPPER_SNAKE

### TypeScript
- Strict mode
- Không dùng `any`
- Dùng `unknown` + narrowing khi cần

### Styling
- Tailwind utilities
- Dùng `cn()` helper để merge className
- Không viết CSS nền nếu không cần thiết

### State
- Server state: Supabase queries
- Client state: React state
- Cross-component: Zustand
- URL state: searchParams

### Comments
- Không comment thừa, chỉ comment logic khó / reason

## 9) Các bug / issue đã được phát hiện và cần nhớ

- Notification bug đã fix ở sidebar: cần kiểm tra `is_muted`, `is_archived`, `user_blocks` trước khi push notification
- Realtime message features có vấn đề liên quan đến `reply_to`, edit sync, delete sync, reactions visibility
- Nhiều thay đổi realtime cần xử lý như UPDATE/DELETE event trong subscription

## 10) Commands chủ yếu để chạy dự án

```bash
cd chatly

npm run dev
npm run build
npm run typecheck
npm run lint
npm run lint:fix
npm run format
```

Supabase:

```bash
cd chatly
supabase start
supabase db reset
supabase migration new X
supabase gen types ts > src/types/database.ts
```

## 11) Thứ tự nên đọc khi bắt đầu session

1. `CLAUDE.md` ở root
2. `chatly/CLAUDE.md`
3. `docs/03-phases.md`
4. `docs/01-architecture.md`
5. `chatly/src/app/(chat)/layout.tsx`
6. `chatly/src/components/chat/chat-view.tsx`
7. `chatly/src/hooks/use-messages.ts`
8. `chatly/src/lib/actions/messages.ts`
9. `chatly/src/lib/supabase/*.ts`
10. `chatly/src/stores/*.ts`

## 12) Mẹo cho Claude / AI agent

- Luôn ưu tiên hiểu architecture trước khi sửa code
- Không sửa theo kiểu “đoán mò”; phải trace data flow từ hook → action → Supabase → realtime → UI
- Khi làm việc với Realtime, phải kiểm tra event handlers cho INSERT / UPDATE / DELETE / broadcast
- Khi làm issue liên quan UI, phải đọc cả component + hooks + store liên quan cùng lúc
- Dự án này tập trung vào app chat real-time dưới App Router của Next.js 16, không phải project React truyền thống

## 13) Kết luận

Dự án Chatly là một app chat realtime hiện đại với cấu trúc rõ ràng, module hóa tốt, và có nhiều feature từ mock UI đến data thật, auth, realtime, notifications, WebRTC. Nếu cần sửa hoặc mở rộng feature mới, AI agent nên bắt đầu từ 3 layer chính:

- `app/` – routing và page
- `components/` – giao diện
- `hooks/` + `lib/actions/` + `stores/` – logic nghiệp vụ & realtime

Đây là “bộ não” của repo để Claude không bị mất phương hướng khi làm việc trong dự án này.
