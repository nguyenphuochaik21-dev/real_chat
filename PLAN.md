# KẾ HOẠCH TỔNG THỂ DỰ ÁN CHATLY

> **Đọc kỹ file này trước khi duyệt.** Nó là bản tóm tắt toàn bộ dự án ở mức strategic, kèm tham chiếu đến docs chi tiết.

---

## 1. Tóm tắt 1 câu

Xây dựng **ứng dụng chat realtime đầy đủ tính năng** với giao diện giống template [Chatly](https://html.designstream.co.in/chatly/), dùng **Next.js 16 + Supabase**, triển khai qua **6 phases rõ ràng**.

---

## 2. Stack đã chốt

| Layer | Technology | Lý do |
|-------|------------|-------|
| Framework | **Next.js 16** (App Router) | Server Components, Server Actions, performance tốt nhất 2026 |
| Language | **TypeScript** strict | Type safety toàn dự án |
| UI | **TailwindCSS v4** + **shadcn/ui** + **lucide-react** | Tốc độ dev + consistency |
| Theme | **next-themes** | Light/dark mode đơn giản |
| State (client) | **Zustand** | UI state ephemeral |
| State (server) | **Supabase queries** + RSC | Single source of truth |
| Forms | **react-hook-form** + **zod** | Validation mạnh |
| Backend | **Supabase** (Postgres + Auth + Realtime + Storage) | Tích hợp nhanh, RLS mạnh, free tier tốt |
| Auth | Email/Password + Magic Link + OAuth (Google + GitHub) | User đa dạng |
| Testing | Vitest + Testing Library + Playwright | Stack test chuẩn Next.js |

---

## 3. 6 Phases (đã duyệt ở bước hỏi)

| Phase | Tên | Thời gian ước tính | Trạng thái |
|-------|-----|---------------------|------------|
| 0 | Setup & Planning | 1-2 giờ | 🔄 Đang làm |
| 1 | **UI đầy đủ với mock data** | 4-6 giờ | ⏳ Sắp tới |
| 2 | Auth & Real Database | 6-8 giờ | 📋 |
| 3 | Realtime Messaging | 4-6 giờ | 📋 |
| 4 | Rich Features (media, search, notifications) | 8-10 giờ | 📋 |
| 5 | Voice & Video Call | 6-8 giờ | 📋 |
| 6 | Group Chat, Stories, Polish | 6-8 giờ | 📋 |

Chi tiết từng phase → [docs/03-phases.md](docs/03-phases.md)

---

## 4. Đầu ra Phase 1 (Phase đang chuẩn bị vào)

**Mục tiêu**: Toàn bộ UI y hệt template, dùng mock data cứng.

### Sẽ build:

1. **Sidebar (4 icons)**: Chats, Contacts, Calls, Favorites, Status, Settings
2. **4 panels chính** (grid responsive):
   - Sidebar nav (64px)
   - List panel (320px) — conversations / contacts / calls / favorites tùy tab
   - Detail panel (flex-1) — chat view hoặc settings page
   - Info panel (320px, mở/đóng qua URL state) — gradient header, avatar, actions, sections
3. **Pages**:
   - Chats list + chat view (mặc định)
   - Contacts (alphabet list với letter headers)
   - Calls (All/Missed/Incoming/Outgoing tabs)
   - Favorites (starred contacts)
   - Status (my status + recent updates)
   - Settings (Account, Notifications, Appearance, Chats, Storage, Help, Invite)
4. **Sub-pages settings**: Account và Appearance có nội dung thật (theme toggle, font size)
5. **Dark/Light mode**: hoạt động đầy cuối, persist qua localStorage
6. **Mock data**: 10 users, 8 conversations, 50+ messages, call history, status updates
7. **Animations**: panel slide, message fade, hover states
8. **Routing**: route groups `(auth)` và `(chat)`, deep linking, browser back/forward

### KHÔNG build ở Phase 1:
- ❌ Backend thực sự (mock data only)
- ❌ Authentication thực (current user = "John Doe" giả lập)
- ❌ Realtime messaging (chat chỉ render mock messages)
- ❌ Gửi file/ảnh (input chỉ text)
- ❌ Voice/video call (icon có nhưng không hoạt động)

---

## 5. Cấu trúc thư mục (sẽ tạo ở Phase 0)

```
chatly/
├── CLAUDE.md                    # Bộ não dự án
├── PLAN.md                      # File này
├── docs/                        # Bản đồ dự án (đã viết)
│   ├── 00-overview.md
│   ├── 01-architecture.md
│   ├── 02-database.md
│   ├── 03-phases.md
│   ├── 04-ui-spec.md
│   ├── 05-api-routes.md
│   ├── 06-conventions.md
│   ├── 07-changelog.md
│   └── 08-tasks.md
├── .claude/
│   ├── agents/                  # 5 agents đã tạo
│   │   ├── nextjs-architect.md
│   │   ├── supabase-engineer.md
│   │   ├── code-reviewer.md
│   │   ├── test-writer.md
│   │   └── researcher.md
│   └── skills/                  # 5 skills đã tạo
│       ├── chatly-design-tokens.md
│       ├── chatly-component-pattern.md
│       ├── supabase-rls-template.md
│       ├── nextjs-server-action.md
│       └── chatly-test-fixture.md
└── (sẽ tạo ở Phase 0 bước tiếp)
    ├── src/                     # Next.js source
    ├── public/                  # Static assets
    ├── supabase/                # Migrations + seed (Phase 2)
    ├── package.json
    ├── tsconfig.json
    ├── next.config.ts
    ├── tailwind.config.ts
    ├── .env.example
    └── .gitignore
```

---

## 6. Agents (5) — đã tạo

| Agent | Khi nào dùng |
|-------|--------------|
| **nextjs-architect** | Đánh giá kiến trúc Next.js, Server vs Client, caching, performance |
| **supabase-engineer** | Schema, RLS, migrations, Realtime, tối ưu query |
| **code-reviewer** | Review code tìm bug, security issue, anti-pattern |
| **test-writer** | Viết Vitest + RTL + Playwright test |
| **researcher** | Tra cứu docs, đối chiếu best practice mới nhất |

---

## 7. Skills (5) — đã tạo

| Skill | Khi nào trigger |
|-------|-----------------|
| **chatly-design-tokens** | Khi style component, dùng đúng color/spacing |
| **chatly-component-pattern** | Khi tạo component mới |
| **supabase-rls-template** | Khi viết RLS policies (Phase 2+) |
| **nextjs-server-action** | Khi viết Server Action (Phase 2+) |
| **chatly-test-fixture** | Khi viết test cần mock data |

---

## 8. Quy tắc làm việc (đã ghi trong CLAUDE.md)

### Mỗi session sẽ:
1. Đọc CLAUDE.md + docs/08-tasks.md + docs/07-changelog.md
2. Làm task theo phase hiện tại
3. Cập nhật tasks/changelog khi xong
4. Tôn trọng conventions trong docs/06-conventions.md

### Mỗi phase sẽ:
1. Tạo branch riêng (`phase-X-...`)
2. Build đủ theo tasks trong [docs/03-phases.md](docs/03-phases.md)
3. Demo được, review code, merge
4. Cập nhật docs liên quan

---

## 9. Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
|--------|------------|
| Next.js 16 còn mới, ít tutorial | `researcher` agent sẽ tra cứu docs chính thức |
| Supabase RLS sai dẫn đến lộ data | `supabase-engineer` review + checklist bắt buộc |
| UI lệch template do chưa hiểu rõ | So sánh với ảnh template, dùng design tokens |
| Mock data khó swap sang real DB | Thiết kế `lib/mock/` cùng shape với Supabase types |
| Scope creep | Mỗi phase có tiêu chí "Done" rõ ràng |

---

## 10. Câu hỏi có thể bạn muốn hỏi thêm?

- [ ] Bạn muốn **tôi bắt đầu Phase 0 ngay** (tạo Next.js project, cài deps, setup lint)?
- [ ] Hay muốn **review/chỉnh sửa docs** trước khi code?
- [ ] Hay muốn **xem thêm chi tiết** về phase nào?

---

## 11. Sau khi bạn duyệt

Tôi sẽ:
1. Tạo branch `phase-0-setup`
2. Chạy `npx create-next-app@latest` với config chuẩn
3. Cài dependencies: tailwindcss, next-themes, @supabase/ssr, @supabase/supabase-js, lucide-react, zustand, react-hook-form, zod, @hookform/resolvers, clsx, tailwind-merge
4. Setup ESLint, Prettier
5. Cài shadcn/ui (init + add components cần)
6. Tạo folder structure theo CLAUDE.md
7. Tạo README.md với hướng dẫn setup
8. Initial commit + push
9. Cập nhật [docs/07-changelog.md](docs/07-changelog.md) và [docs/08-tasks.md](docs/08-tasks.md)

Sau đó chuyển sang Phase 1.
