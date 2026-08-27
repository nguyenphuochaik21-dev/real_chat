# 01 - Kiến trúc hệ thống

## Sơ đồ tổng quan (Phase 1 - Mock)

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (User)                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Next.js 16 (App Router)                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Server Components (RSC)  - default                 │   │
│  │  Client Components ('use client') - chỉ khi cần     │   │
│  │  Server Actions - mutations                          │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                 │
│                           ▼                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Mock Data Layer (lib/mock/)                         │   │
│  │  - users.ts, conversations.ts, messages.ts           │   │
│  │  - Được thay bằng Supabase ở Phase 2                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  Mock Storage (In-memory)                   │
│  - Giả lập user, conversations, messages                   │
│  - LocalStorage cho persistence demo                       │
└─────────────────────────────────────────────────────────────┘
```

## Sơ đồ Phase 2 (With Supabase)

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (User)                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Next.js 16 (App Router)                        │
│  - Server Components → Supabase Server Client              │
│  - Client Components → Supabase Browser Client              │
│  - middleware.ts → refresh session cookies                 │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS + WebSocket
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                       Supabase                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  PostgreSQL  │  │     Auth     │  │  Realtime        │  │
│  │  + RLS       │  │  Email/OAuth │  │  Broadcast/PGC   │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐                        │
│  │   Storage    │  │  Edge Funcs  │                        │
│  │  (Phase 2+)  │  │  (Phase 3+)  │                        │
│  └──────────────┘  └──────────────┘                        │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow Patterns

### Phase 1: Mock data
1. Component render → import từ `lib/mock/`
2. Mock data là TypeScript constants
3. Mutations: cập nhật in-memory + setState
4. Persistence (optional): LocalStorage

### Phase 2: Supabase (sẽ thiết kế chi tiết khi đến phase)
1. **Read**: Server Component → `supabase.from('X').select()`
2. **Mutation**: Server Action → `supabase.from('X').insert()/update()`
3. **Realtime**: Client Component subscribe → `supabase.channel().on('broadcast')`
4. **Auth**: middleware.ts refresh + Server Component check user

## Các quyết định kiến trúc quan trọng

### Q1: Server vs Client Components
- **Server (default)**: Layouts, lists, info panels, settings pages, static displays
- **Client**: Chat input, message list với realtime, dark mode toggle, dropdowns, modals

### Q2: State management
- **Zustand** cho UI ephemeral state (sidebar collapsed, current tab, drafts)
- **Supabase queries** cho server state (realtime subscription tự handle cache)
- **React Hook Form** cho form state
- **URL state** (searchParams) cho filters, active conversation

### Q3: Routing
- Route groups `(auth)` và `(chat)` để tách layout
- `/chats/[id]` cho cuộc trò chuyện cụ thể
- Sidebar là persistent layout, panel phải đóng/mở qua URL state

### Q4: Theme
- `next-themes` với system detection
- CSS variables cho colors (theme-aware)
- Tailwind v4 với @theme directive
- Toggle user qua Settings → Appearance
