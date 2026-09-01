# Chatly Delivery Plan — 2026-09-01

## Phase 1 — Repository audit and cleanup ✅

- Removed unused create-next-app assets, obsolete mock modules, stale hooks, and duplicate notes.
- Consolidated the current architecture and handoff state in `memory/chatly-context.md`.

## Phase 2 — Core stability ✅

- Fixed Sidebar Realtime channel lifecycle across route changes and React Strict Mode.
- Replaced participant-only deletion with authorized permanent conversation deletion.
- Cleared conversation state/cache and redirected immediately after deletion.

## Phase 3 — Friendships and public profiles ✅

- Added friend request, accept/decline, cancel, and unfriend workflows.
- Rebuilt Contacts around friends, pending requests, and user discovery.
- Added `/profile/[id]` and profile links from chats, friends, and admin.

## Phase 4 — Administration ✅

- Added database roles, suspension state, protected RPCs, and audit logs.
- Added `/admin` statistics and user access management.
- Created and verified a test administrator outside source control.

## Phase 5 — WebRTC repair ✅

- [x] Removed mount-time camera/microphone acquisition.
- [x] Fixed session IDs, Accept/Decline wiring, signaling ordering, ICE queueing, and media controls.
- [x] Hardened call RPC authorization and idempotent call history.
- [x] Passed two-account, two-browser voice/video acceptance with live remote media tracks.
- [ ] Optional release smoke test on two physical devices and the deployment TURN network.

## Phase 6 — Verification ✅

- [x] Apply new migrations to the configured Supabase project.
- [x] ESLint with zero errors.
- [x] Strict TypeScript validation.
- [x] Next.js production build and runtime route checks.
- [x] Two-browser WebRTC media acceptance and repeated conversation-switch Realtime test.
- [x] Remote friendship lifecycle and permanent conversation deletion smoke tests.
- [x] Final diff and documentation review.
