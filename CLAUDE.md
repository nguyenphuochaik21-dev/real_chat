# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Chatly** is a real-time messaging application inspired by WhatsApp/Telegram, built with:
- **Next.js 16** (App Router, React 19, Server Components, Server Actions)
- **Supabase** (Postgres + Auth + Realtime + Storage)
- **TailwindCSS v4** + shadcn/ui
- **Zustand** for UI state, **Zod** for validation

The project is in the `chatly/` subdirectory.

## Common Commands

```bash
cd chatly

# Development
npm run dev          # Start dev server
npm run build        # Production build
npm run typecheck    # TypeScript check
npm run lint         # ESLint
npm run lint:fix     # ESLint auto-fix
npm run format       # Prettier format

# Supabase (requires supabase CLI)
supabase start              # Start local Supabase
supabase db reset           # Reset database + apply migrations + seed
supabase migration new X    # Create new migration
supabase gen types ts       # Generate TypeScript types from schema
```

## Architecture Overview

### Data Flow
1. **Server Components** → Supabase Server Client → Postgres
2. **Client Components** → Supabase Browser Client (realtime subscriptions)
3. **Mutations** → Server Actions → broadcast realtime updates
4. **WebRTC Calls** → Supabase Realtime broadcast channels for signaling

### Key Files
- `src/lib/supabase/client.ts` - Browser client
- `src/lib/supabase/server.ts` - Server-side client
- `src/lib/supabase/middleware.ts` - Session refresh
- `src/lib/webrtc.ts` - WebRTC service for voice/video calls
- `src/middleware.ts` - Route protection

### Route Structure
- `(auth)/` - Login, register, OAuth callbacks
- `(chat)/` - Protected app routes (chats, contacts, calls, settings)

### Realtime Implementation
- Messages: `supabase.channel('room:{id}').on('broadcast')` per conversation
- Presence: `supabase.channel('presence:{userId}').on('presence')`
- Call signaling: `supabase.channel('call-signaling-{sessionId}').on('broadcast')`

## Development Conventions

- **Server Components by default** - add `'use client'` only when needed (state, effects, browser APIs)
- **TypeScript strict mode** - no `any`, use `unknown` with narrowing
- **Zod validation** for all user input
- **Tailwind utility-first** - no raw CSS except special animations
- **Conventional commits**: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`

## Documentation

Detailed docs are in `docs/`:
- [docs/00-overview.md](docs/00-overview.md) - Product overview, MVP goals
- [docs/01-architecture.md](docs/01-architecture.md) - System architecture, data flow
- [docs/02-database.md](docs/02-database.md) - Supabase schema, RLS policies
- [docs/03-phases.md](docs/03-phases.md) - Roadmap (Phases 0-6)
- [docs/04-ui-spec.md](docs/04-ui-spec.md) - Design system, components
- [docs/06-conventions.md](docs/06-conventions.md) - Coding conventions

## Current Status

- **Phase 5 (WebRTC Calls)** - Complete ✅
- **Phase 6 (Groups, Stories, Polish)** - Pending

## Database

Migrations are in `chatly/supabase/migrations/` with 20+ migration files covering:
- Profiles, conversations, messages, participants
- Reactions, starred messages, scheduled messages
- Push subscriptions, user blocks
- WebRTC call sessions
- Typing indicators, read receipts, presence

Generate types after migrations:
```bash
cd chatly && supabase gen types ts > src/types/database.ts
```
