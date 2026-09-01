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
- Added private Realtime Broadcast updates and an incoming-request badge on desktop and mobile.

## Phase 4 — Administration ✅

- Added database roles, suspension state, protected RPCs, and audit logs.
- Added `/admin` statistics and user access management.
- Created and verified a test administrator outside source control.

## Phase 5 — WebRTC repair ✅

- [x] Removed mount-time camera/microphone acquisition.
- [x] Fixed session IDs, Accept/Decline wiring, signaling ordering, ICE queueing, and media controls.
- [x] Hardened call RPC authorization and idempotent call history.
- [x] Passed two-account, two-browser voice/video acceptance with live remote media tracks.
- [x] Expire abandoned ringing sessions so old calls cannot reappear after login or refresh.
- [ ] Optional release smoke test on two physical devices and the deployment TURN network.

## Phase 6 — Verification ✅

- [x] Apply new migrations to the configured Supabase project.
- [x] Add double-click/tap heart reactions, Messenger-style placement, and expanded pickers.
- [x] Remove the unused Status route, navigation item, mock data, and stale product-plan scope.
- [x] ESLint with zero errors.
- [x] Strict TypeScript validation.
- [x] Next.js production build and runtime route checks.
- [x] Two-browser WebRTC media acceptance and repeated conversation-switch Realtime test.
- [x] Remote friendship lifecycle and permanent conversation deletion smoke tests.
- [x] Final diff and documentation review.

## Phase 7 — Group Chat, PWA & Polish ✅

### Phase 7.1 — Group data model and authorization

- [x] Add owner/admin/member roles and secure group-management RPCs.
- [x] Support atomic group creation, invitations, member removal, role changes, and leaving.
- [x] Restrict metadata updates and permanent deletion to the appropriate group role.

### Phase 7.2 — Group chat experience

- [x] Add group creation from accepted friends.
- [x] Render direct and group conversations correctly in lists, search, forwarding, and chat headers.
- [x] Show message senders in groups and add member/permission management UI.
- [x] Refresh group membership and metadata through Realtime without a manual reload.

### Phase 7.3 — PWA and mobile completion

- [x] Add a Next.js web app manifest, installable app icons, and theme metadata.
- [x] Extend the existing push service worker with safe static-shell caching and offline fallback.
- [x] Add service-worker registration/install affordance and complete narrow-screen layouts.

### Phase 7.4 — Performance and accessibility

- [x] Remove conversation-list query waterfalls and lazy-load heavyweight modal UI.
- [x] Add keyboard/focus semantics, labels, live regions, reduced-motion support, and contrast-safe states.
- [x] Audit the primary auth, navigation, conversation, and group-management flows.

### Phase 7.5 — E2E and release verification

- [x] Configure Playwright and cover public/auth shell plus authenticated group workflows.
- [x] Run ESLint, strict TypeScript, E2E smoke tests, and a Next.js production build.
- [x] Update delivery docs and record any environment-dependent release smoke tests.

Release-environment follow-ups:

- [ ] Run the mutation-enabled group test with an account that has at least two accepted friends.
- [ ] Smoke-test installation, offline navigation, and push notifications on physical mobile devices.
