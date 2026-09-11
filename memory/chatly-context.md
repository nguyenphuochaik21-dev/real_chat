# Chatly: current context

Last reviewed: 2026-09-10

## Runtime

- App: `chatly/` (Next.js 16 App Router, React 19, Supabase, Zustand, Tailwind v4).
- Routes: authentication under `src/app/(auth)` and protected product pages under
  `src/app/(chat)`.
- Data mutations use server actions in `src/lib/actions/`; browser subscriptions live in hooks
  and providers.
- Before changing Next.js behavior, read the matching installed guide in
  `chatly/node_modules/next/dist/docs/`.
- Never commit credentials. Public Supabase values belong in `.env.local`; service-role and VAPID
  private keys must remain server-only.

## Critical application paths

- Messaging UI and mutations: `src/components/chat/chat-view.tsx` and
  `src/lib/actions/messages.ts`.
- Conversation loading and lifecycle: `src/hooks/use-conversations.ts`,
  `src/lib/actions/conversations.ts`, and `src/components/chat/chats-list.tsx`.
- Groups: `src/lib/actions/groups.ts` and `src/components/groups/`.
- Calls: `src/lib/webrtc.ts`, `src/hooks/use-webrtc-call.ts`, and `src/components/calls/`.
- Auth/profile: `src/lib/supabase/`, `src/hooks/use-auth.ts`, and
  `src/lib/actions/profile.ts`.
- Global notifications and badges: `src/components/notifications/`,
  `src/hooks/use-navigation-badges.ts`, and `src/components/layout/`.
- Database contract: `supabase/migrations/` is authoritative;
  `src/types/database.ts` is the TypeScript mirror used by the app.

## Database migration baseline

- There are 47 committed, append-only SQL migrations, ending at
  `20260909070000_support_push_deduplication.sql`.
- The `202501...` names are migration sequence identifiers, not evidence that the files are safe
  to remove. They create the base schema needed by fresh databases.
- Do not delete, rename, reorder, edit, or squash an existing migration during normal feature
  work. Later `CREATE OR REPLACE` and `DROP ... IF EXISTS` statements may supersede runtime
  definitions, but the earlier files still belong to local reset, CI, new environments, and remote
  migration-history reconciliation.
- A squash is only safe as an explicit database-baseline project after checking every deployed
  environment and repairing remote migration history. That was not performed in the 2026-09-10
  audit.
- On 2026-09-10, `supabase migration list --db-url DIRECT_URL` confirmed that all 47 local
  migrations exactly match the linked production database through
  `20260909070000_support_push_deduplication.sql`.
- `supabase db lint --level warning` reported no schema errors. The database was about 21 MB with
  healthy cache-hit ratios and no replication lag or blocking queries at the time of the audit.

### Migration groups

- `20250101000001`-`20250101000019`: profiles, direct conversations, participants, messages,
  RLS, Realtime, presence/read receipts, typing, media storage, full-text search, reactions,
  starred messages, and user blocks.
- `20250102000000`-`20250105000000`: push subscriptions, scheduled messages and labels,
  `pg_cron`, and WebRTC call sessions/history.
- `20260901000000`-`20260901090000`: permanent conversation deletion, friendships,
  administration, call hardening/expiry, private friendship broadcasts, group roles and secure
  group lifecycle RPCs.
- `20260901100000`-`20260901110000`: message/storage/scheduling security and scale hardening,
  atomic direct-chat creation, profile fields and avatar storage, grouped media, and multi-device
  push subscriptions.
- `20260907010000`-`20260907030000`: bounded admin pagination, high-volume indexes, group sharing
  and join approval, support requests, verified profiles, and storage cleanup triggers.
- `20260908010000`-`20260909070000`: single-reaction enforcement, admin/unread performance,
  assigned support queues and Realtime, runtime indexes, RLS advisor fixes, redundant-index
  removal, and push-notification deduplication.

### Current data model and invariants

- Core tables: `profiles`, `conversations`, `conversation_participants`, and `messages`.
- Social and message features: `friendships`, `message_reactions`, `starred_messages`,
  `user_blocks`, `typing_indicators`, `conversation_labels`, and `conversation_label_map`.
- Operations: `scheduled_messages`, `push_subscriptions`, `call_sessions`, `call_history`,
  `admin_audit_logs`, `group_join_requests`, and `support_requests`.
- Storage buckets are `chat-media` and `profile-avatars`.
- RLS is part of the product contract. Security-sensitive mutations use guarded
  `SECURITY DEFINER` RPCs with restricted grants and explicit `search_path` values.
- Direct conversation creation should use `get_or_create_direct_conversation`; group membership
  changes use the group RPCs. The legacy `add_conversation_participant` reference remains only in
  the old-database fallback path and generated types.
- Group membership uses owner/admin/member roles. Creation accepts confirmed friends, privileged
  changes are serialized, and ownership transfers deterministically when an owner leaves.
- Group unread state is participant-based through `last_read_at`; the single message status is
  meaningful mainly for direct chats.
- Support requests are assigned to a selected administrator, published through Realtime, and use
  separate admin/user push markers to prevent duplicate notifications.

## Product state

- Direct and group messaging, media, search, reactions, starred messages, scheduling, labels,
  blocks, friendships, public profiles, administration, support, WebRTC calls, push notifications,
  PWA/offline behavior, and responsive layouts are implemented.
- `/favorites` and `/status` were removed intentionally. `/starred` remains a supported feature.
- Friendship changes use private per-user Database Broadcast topics.
- Incoming-call recovery ignores sessions older than 60 seconds; a database cleanup RPC and
  one-minute cron job expire abandoned pending calls.
- The credential-free Playwright suite passed 14 tests on desktop and a Pixel 7 viewport on
  2026-09-10. The authenticated group mutation test remains opt-in and was skipped because no
  dedicated E2E credentials are configured.
- The 2026-09-10 production audit added bounded link-preview image reads, stronger CSP directives,
  resilient service-worker registration, truthful non-E2EE security copy, functional call-history
  redial, and lazy-loaded browser auth/push code.
- The optimized local production build scored 97 Performance and 100 for Accessibility, Best
  Practices, and SEO in Lighthouse on `/login`; results can vary between runs and environments.
- Commit `5ac723f` deployed successfully through the GitHub/Vercel integration on 2026-09-11. The
  production `/login` then scored 97 Performance and 100 for Accessibility, Best Practices, and SEO.
- Remaining release checks are physical-device PWA/push/TURN testing and the opt-in authenticated
  group mutation test with an account that has at least two accepted friends.

## Validation

Run from `chatly/`: `npm run lint`, `npm run typecheck`, `npm run test:e2e`, and `npm run build`.
Run `git diff --check` from the repository root. For database work, also verify linked migration
status before `npx supabase db push`.
