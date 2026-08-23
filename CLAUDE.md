# CLAUDE.md - Chatly Realtime Chat App

> **Bộ não trung tâm của dự án**. File này là điểm vào đầu tiên cho mọi session làm việc với dự án. Nó map tới tất cả tài liệu, agents, skills, quyết định kiến trúc và trạng thái hiện tại.

---

## 1. Tổng quan dự án

**Tên**: Chatly - Ứng dụng chat realtime
**Mục tiêu**: Xây dựng ứng dụng chat realtime với giao diện giống [Chatly template](https://html.designstream.co.in/chatly/) — purple/indigo theme, dark/light mode, sidebar đa chức năng, chat 1-1 realtime với panel thông tin mở rộng.
**Stack đã chốt**:
- **Framework**: Next.js 16 (App Router, React 19, Server Components, Server Actions)
- **UI**: TailwindCSS v4 + shadcn/ui + lucide-react + next-themes
- **Backend**: Supabase (Postgres + Auth + Realtime + Storage)
- **Auth**: Email/Password + Magic Link + OAuth (Google + GitHub)
- **Forms**: react-hook-form + zod
- **State**: Zustand (chỉ cho UI state ephemeral, server state qua Supabase)
- **Language**: TypeScript strict mode

---

## 2. Cấu trúc tài liệu (`docs/`)

Mỗi file .md là một phần của "bản đồ dự án" — luôn đọc khi bắt đầu session, cập nhật khi có thay đổi.

| File | Mục đích |
|------|----------|
| [docs/00-overview.md](docs/00-overview.md) | Tổng quan sản phẩm, user personas, mục tiêu MVP |
| [docs/01-architecture.md](docs/01-architecture.md) | Kiến trúc hệ thống, sơ đồ, data flow |
| [docs/02-database.md](docs/02-database.md) | Schema Supabase, RLS policies, migrations |
| [docs/03-phases.md](docs/03-phases.md) | Roadmap chi tiết từng phase (P1-P6) |
| [docs/04-ui-spec.md](docs/04-ui-spec.md) | Design system, components, layouts, màu sắc |
| [docs/05-api-routes.md](docs/05-api-routes.md) | Server Actions và Route Handlers |
| [docs/06-conventions.md](docs/06-conventions.md) | Coding conventions, naming, file structure |
| [docs/07-changelog.md](docs/07-changelog.md) | Lịch sử thay đổi các quyết định |
| [docs/08-tasks.md](docs/08-tasks.md) | Danh sách task đang mở, đang làm, đã xong |

---

## 3. Cấu trúc dự án (Next.js 16 chuẩn)

```
chatly/
├── CLAUDE.md                          # File này — bộ não dự án
├── README.md
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── .env.local                         # Gitignore — biến môi trường
├── .env.example                       # Template cho Supabase keys
├── docs/                              # Tài liệu bản đồ dự án (xem mục 2)
├── .claude/
│   ├── agents/                        # Custom agents (xem mục 5)
│   ├── skills/                        # Custom skills (xem mục 6)
│   └── hooks/                         # Hooks tự động
├── public/
├── supabase/
│   ├── migrations/                    # SQL migrations có version
│   └── seed.sql                       # Dữ liệu mẫu cho dev
└── src/
    ├── app/                           # App Router
    │   ├── layout.tsx                 # Root layout
    │   ├── globals.css
    │   ├── (auth)/                    # Route group: auth pages
    │   │   ├── login/page.tsx
    │   │   ├── register/page.tsx
    │   │   ├── callback/route.ts
    │   │   └── layout.tsx
    │   ├── (chat)/                    # Route group: app chính (cần auth)
    │   │   ├── layout.tsx             # Sidebar shell
    │   │   ├── chats/page.tsx         # Default → redirect
    │   │   ├── chats/[id]/page.tsx    # Cuộc trò chuyện cụ thể
    │   │   ├── contacts/page.tsx
    │   │   ├── calls/page.tsx
    │   │   ├── favorites/page.tsx
    │   │   ├── status/page.tsx
    │   │   └── settings/page.tsx
    │   └── api/                       # Route handlers (nếu cần)
    ├── components/
    │   ├── ui/                        # shadcn primitives
    │   ├── layout/                    # Sidebar, topbar, info panel
    │   ├── chat/                      # MessageBubble, ChatInput, MessageList
    │   ├── contacts/
    │   ├── calls/
    │   ├── status/
    │   └── settings/
    ├── lib/
    │   ├── supabase/
    │   │   ├── client.ts              # Browser client
    │   │   ├── server.ts              # Server client (RSC, Server Actions)
    │   │   └── middleware.ts          # Refresh session
    │   ├── auth/
    │   ├── utils.ts                   # cn() và helpers
    │   └── validators/                # Zod schemas
    ├── hooks/                         # useRealtimeMessages, useConversation, ...
    ├── stores/                        # Zustand stores (UI state)
    ├── types/
    │   ├── database.ts                # Generated từ Supabase
    │   └── index.ts
    └── middleware.ts                  # Supabase session refresh
```

---

## 4. Quy tắc làm việc

### 4.1. Trước khi bắt đầu session
1. **Đọc file này** (CLAUDE.md).
2. Đọc [docs/08-tasks.md](docs/08-tasks.md) để biết task đang mở.
3. Đọc [docs/07-changelog.md](docs/07-changelog.md) để biết thay đổi gần đây.
4. Đọc phase hiện tại trong [docs/03-phases.md](docs/03-phases.md).

### 4.2. Khi hoàn thành task hoặc có thay đổi kiến trúc
1. Cập nhật [docs/08-tasks.md](docs/08-tasks.md) — đánh dấu task xong.
2. Nếu là quyết định kiến trúc, thêm vào [docs/07-changelog.md](docs/07-changelog.md).
3. Cập nhật các file docs liên quan (schema đổi → [docs/02-database.md](docs/02-database.md), ...).

### 4.3. Coding conventions
- **TypeScript strict** everywhere.
- **Server Components by default**; thêm `'use client'` chỉ khi cần (state, effects, browser APIs).
- **Server Actions** cho mutations; **Route Handlers** chỉ khi cần API public.
- **Một component một file**, tên file trùng tên component.
- **Tailwind utility-first**, không viết CSS thuần trừ animations đặc biệt.
- **Không comment thừa** — code tự giải thích; comment chỉ khi giải thích "tại sao" chứ không phải "cái gì".
- **Zod validate mọi input** từ user.

---

## 5. Agents tùy chỉnh (`.claude/agents/`)

| Agent | File | Mục đích |
|-------|------|----------|
| `nextjs-architect` | [.claude/agents/nextjs-architect.md](.claude/agents/nextjs-architect.md) | Tư vấn kiến trúc Next.js 16, đánh giá trade-off |
| `supabase-engineer` | [.claude/agents/supabase-engineer.md](.claude/agents/supabase-engineer.md) | Thiết kế schema, viết RLS, tối ưu query |
| `code-reviewer` | [.claude/agents/code-reviewer.md](.claude/agents/code-reviewer.md) | Review code tìm bug, anti-pattern, security issue |
| `test-writer` | [.claude/agents/test-writer.md](.claude/agents/test-writer.md) | Viết unit test, integration test, e2e test |
| `researcher` | [.claude/agents/researcher.md](.claude/agents/researcher.md) | Tra cứu docs, đối chiếu best practice mới nhất |

---

## 6. Skills tùy chỉnh (`.claude/skills/`)

| Skill | Mục đích |
|-------|----------|
| `chatly-design-tokens` | Áp dụng design system (màu, spacing, typography) |
| `chatly-component-pattern` | Recipe tạo component chuẩn Chatly |
| `supabase-rls-template` | Template viết RLS policies an toàn |
| `nextjs-server-action` | Recipe viết Server Action đúng chuẩn |
| `chatly-test-fixture` | Tạo mock data cho test |

---

## 7. Trạng thái hiện tại

**Phase hiện tại**: Phase 0 — Setup & Planning (đang thực hiện)
**Phase tiếp theo**: Phase 1 — UI đầy đủ với mock data
**Tiến độ tổng thể**: 0%

Xem chi tiết tại [docs/03-phases.md](docs/03-phases.md).

---

## 8. Conventions git (đề xuất)

- Commit theo conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`
- Mỗi phase = một branch (vd: `phase-1-ui-mockup`)
- Commit nhỏ, có ý nghĩa; squash khi merge
- Mỗi commit có tham chiếu task ID từ [docs/08-tasks.md](docs/08-tasks.md) nếu có

---

## 9. Lệnh nhanh tham khảo

```bash
# Setup
npm install
npm run dev                 # Next dev server
npm run build               # Production build
npm run typecheck           # TypeScript check
npm run lint                # ESLint
npm run test                # Vitest
npm run test:e2e            # Playwright

# Supabase (cần cài supabase CLI)
supabase start              # Local Supabase
supabase db reset           # Reset + apply migrations + seed
supabase migration new X    # Tạo migration mới
supabase gen types ts       # Generate types
```

---

## 10. Cập nhật file này

Khi nào cập nhật CLAUDE.md:
- Thêm phase mới
- Đổi stack (vd: thay Supabase → Firebase)
- Thêm/xóa agents hoặc skills
- Đổi cấu trúc thư mục

Khi KHÔNG cập nhật CLAUDE.md:
- Thêm feature nhỏ → ghi vào [docs/08-tasks.md](docs/08-tasks.md)
- Fix bug → ghi vào [docs/07-changelog.md](docs/07-changelog.md)
- Đổi schema → cập nhật [docs/02-database.md](docs/02-database.md)
