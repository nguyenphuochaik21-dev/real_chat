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
- [x] `lib/mock/status.ts` - 5 status updates

### 1.3. Sidebar ✅
- [x] Logo + nav items (Chats, Contacts, Calls, Favorites, Status, Settings)
- [x] Active state highlight
- [x] User avatar bottom

### 1.4. Chats list panel ✅
- [x] Search + tabs (All, Unread, Personal)
- [x] Conversation item (avatar, name, last message, time, unread badge, pin icon)
- [x] Pin/archive states
- [x] Empty state

### 1.5. Chat view ✅
- [x] Header with actions (call, video, search, menu)
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
- [x] Favorites
- [x] Status (view status updates)
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

## Phase 4 — Rich Features
(chưa bắt đầu)

## Phase 5 — Voice/Video
(chưa bắt đầu)

## Phase 6 — Group & Stories
(chưa bắt đầu)

---

## Backlog (chưa xếp phase)

- [ ] Thiết lập CI/CD (GitHub Actions: typecheck, lint, test, build)
- [ ] Setup Vercel deployment
- [ ] Custom domain
- [ ] Sentry error tracking
- [ ] Analytics (Plausible/PostHog)
- [ ] SEO optimization (không quan trọng nhưng nên có)
