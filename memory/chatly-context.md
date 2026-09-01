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

1. Stabilize Realtime subscriptions and permanent conversation deletion.
2. Add friendships and public profile pages.
3. Add role-protected administration.
4. Repair and re-verify Phase 5 WebRTC, including media lifecycle and remote playback.
5. Run lint, typecheck, production build, and runtime route checks.

## Known facts

- `/favorites` was removed intentionally; `/starred` is a different feature and remains.
- `docs/03-phases.md` previously marked WebRTC complete, but it is not accepted until a
  two-user voice/video call passes end-to-end.
- The mock status screen still uses `src/lib/mock/{users,status,types}.ts`; do not remove those
  modules until Status is backed by Supabase.
- Never commit credentials. Admin access must be represented by a database role and bootstrapped
  through a documented, one-time SQL step for an existing Auth user.
- Migrations through `20260901040000` are applied to the Supabase project configured in
  `chatly/.env.local`; the previously missing remote migration-history rows were repaired after
  confirming the corresponding tables already existed.
- WebRTC code no longer acquires media on app mount. A production-build E2E run passed voice then
  video between two authenticated Chrome contexts using fake media; both peers received live
  remote tracks. A physical-device/TURN smoke test remains a release-environment follow-up.
- Remote smoke tests also passed friend request/accept/remove, permanent conversation deletion,
  and repeated navigation between conversations without duplicate Realtime callback errors.

## Validation

Run from `chatly/`: `npm run lint`, `npm run typecheck`, `npm run build`, then
`git diff --check` from the repository root.
