# Chatly: current context

Last reviewed: 2026-09-01

## Runtime

- App: `chatly/` (Next.js 16 App Router, React 19, Supabase, Zustand, Tailwind v4).
- Routes: authentication under `app/(auth)` and protected product pages under `app/(chat)`.
- Data mutations use server actions in `src/lib/actions/`; browser subscriptions live in hooks and providers.
- Database changes are append-only SQL files in `chatly/supabase/migrations/`.
- Before changing Next.js behavior, read the matching installed guide in
  `chatly/node_modules/next/dist/docs/`.

## Critical paths

- Messaging: `use-messages.ts`, `actions/messages.ts`, `chat-view.tsx`.
- Conversations: `use-conversations.ts`, `actions/conversations.ts`, `chats-list.tsx`.
- Calls: `webrtc.ts`, `use-webrtc-call.ts`, `call-provider.tsx`, `call-screen.tsx`.
- Auth/profile: `supabase/{client,server,middleware}.ts`, `use-profile.ts`,
  `actions/profile.ts`.
- Global Realtime: `components/layout/sidebar.tsx` and notification hooks.
- Database shape: `supabase/migrations/` is authoritative; `src/types/database.ts` mirrors it.

## Current delivery plan

1. Add an authorized group data model and atomic lifecycle RPCs.
2. Add group creation, rendering, sender identity, and member-management UI.
3. Add an installable PWA shell, offline fallback, and complete mobile safe-area layouts.
4. Remove conversation-list waterfalls and improve accessibility and image delivery.
5. Add Playwright/Axe coverage and run release validation.

## Known facts

- `/favorites` was removed intentionally; `/starred` is a different feature and remains.
- `docs/03-phases.md` previously marked WebRTC complete, but it is not accepted until a
  two-user voice/video call passes end-to-end.
- `/status` and its mock data were removed intentionally; Status/Story is no longer in product scope.
- Never commit credentials. Admin access must be represented by a database role and bootstrapped
  through a documented, one-time SQL step for an existing Auth user.
- Migrations through `20260901090000` are applied to the Supabase project configured in
  `chatly/.env.local`; the previously missing remote migration-history rows were repaired after
  confirming the corresponding tables already existed.
- WebRTC code no longer acquires media on app mount. A production-build E2E run passed voice then
  video between two authenticated Chrome contexts using fake media; both peers received live
  remote tracks. A physical-device/TURN smoke test remains a release-environment follow-up.
- Remote smoke tests also passed friend request/accept/remove, permanent conversation deletion,
  and repeated navigation between conversations without duplicate Realtime callback errors.
- Friendship changes use private per-user Database Broadcast topics, so the request badge and both
  users' relationship state update without refreshing the page.
- Double-click/tap applies a heart reaction optimistically and confirms it from Supabase; reactions
  sit on the lower-right edge of the message bubble. The emoji and sticker sets are expanded.
- Incoming-call recovery ignores sessions older than 60 seconds. A database cleanup RPC and an
  active one-minute pg_cron job prevent abandoned pending calls from reappearing after refresh.
- Group membership uses owner/admin/member roles and security-definer RPCs; group creation only
  accepts confirmed friends and the owner role is transferred deterministically when the owner leaves.
- The PWA manifest, generated 192/512 icons, service worker, install prompt, and offline fallback
  are covered by Playwright. The credential-free suite passes on desktop and a Pixel 7 viewport.
- Authenticated group mutation E2E is opt-in with `E2E_MUTATION_TESTS=true` and requires a test user
  with at least two accepted friends. Physical-device PWA/push smoke testing remains a release follow-up.

## Validation

Run from `chatly/`: `npm run lint`, `npm run typecheck`, `npm run test:e2e`, `npm run build`, then
`git diff --check` from the repository root.
