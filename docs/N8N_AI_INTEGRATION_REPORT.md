# CHATLY N8N AI INTEGRATION REPORT

Implementation started: 2026-09-29. Latest validation: 2026-10-02.
The canonical-agent migration `20261001020000_canonical_ai_agents.sql` and the
three `20261002*` follow-up migrations were applied and
recorded on the Supabase project configured by local `DIRECT_URL`. The legacy
`chat_assistant_config` remains for deployed versions; the new application resolves
the default agent from `ai_agents` and `ai_connections`. Application code is still local.
Code and additive migrations are prepared locally. The 2026-10-01 rich-output migration was applied
to the Supabase database configured by local `DIRECT_URL`; application deployment remains an owner
step. Current owner setup is in [N8N_AI_AGENTS.md](N8N_AI_AGENTS.md), and the agent editor
contains the copyable n8n guide. [N8N_AI_CHAT.md](N8N_AI_CHAT.md) documents the older protocol.

The existing multi-agent area is now visible from the main navigation and Admin. Each agent keeps
its own n8n workflow, conversation history and memory session, so conversations with different agents
can process concurrently. Rich n8n outputs support validated HTTPS image, audio, file and link
descriptors. Migration `20261001010000_ai_agent_rich_outputs.sql` was applied successfully to the
database configured by local `DIRECT_URL` and recorded in `supabase_migrations.schema_migrations`.

## Existing Architecture

- Next.js **16.3.4**, React **19.2.8**, TypeScript strict, App Router, npm lockfile.
- Supabase Auth and `@supabase/ssr`; cookie refresh in `src/proxy.ts` and
  `lib/supabase/middleware.ts`; server verification with `auth.getUser()`.
- PostgreSQL through Supabase clients/RPC; no Prisma, Auth.js/NextAuth or Better Auth.
- `profiles`: public user identity, `role` values include `admin`/`user`, suspension.
- `conversations`: direct/group; `conversation_participants`: membership, read position,
  mute/archive/pin; `messages`: nullable profile FK sender, media, metadata.
- Human text messages are inserted by `ChatView` through the authenticated browser
  client, subject to `can_send_message`, RLS and database triggers. Media and scheduled
  messages have existing separate helpers.
- Conversation summaries/unread come from RPCs; client state is cached in Zustand.
- Message realtime is conversation-filtered in ChatView; existing notification and
  conversation-list subscriptions remain. Optimistic rendering deduplicates by ID.
- Friends, groups, calls, support notifications and Web Push already exist. Notification
  state uses a Zustand store and Supabase events; no new notification table is needed.
- `/admin` renders the existing AdminDashboard in the shared chat shell. There is no
  general settings table suitable for encrypted assistant connection configuration.
- No project `vercel.json` was found. Next route configuration controls Node runtime
  and maximum duration for new endpoints. Existing CSP and image restrictions remain.
- Installed Next documentation for Route Handlers and Proxy was consulted.

Before this task, the workspace already contained untracked `/ai`, `/admin/ai-agents`,
`lib/ai`, `types/ai.ts`, an `ai_agents` migration, error recovery files and tests. They
were preserved. Their separate multi-agent architecture is **not** the message pipeline
implemented here. Deployment review must account for those pre-existing files separately.

## Changes Made

One integrated assistant entry in Chats; one private AI conversation per user; shared
ChatView rendering/history/realtime; server-controlled sending; Admin configuration
and connection tests; authenticated encryption; SSRF protection; request deduplication;
rate limits; safe error/status handling; documentation and focused tests.

The Admin AI page now includes every n8n node parameter, copy buttons for expressions
and the complete Format Output code. It also explains that n8n Cloud works directly and
that a local n8n Docker container is optional. Admin users have a direct AI Assistant
entry in Settings and a visible link in the existing Admin header.

The local interface now runs directly with `npm run dev`, without a Chatly Docker
container. A preparation script uses Tailwind WASM and generates explicit source
candidates on Windows, avoiding the native binding blocked by Application Control while
still producing the complete utility stylesheet. Docker remains available for a self-hosted
n8n service only.

Two small pre-existing test compatibility gaps were also completed: configurable
temporary-user fixture count and session-cookie-preserving redirects. Existing untracked
AI table/function types were connected to Database so the whole workspace typechecks.

## AI Conversation Architecture

`conversation_type` now supports `ai`. A partial unique index on `created_by` ensures
one AI conversation per user. Opening uses a per-user row lock, creates membership and
a welcome message atomically, and reuses existing history. Different users have different
conversation IDs and memory sessions. AI messages use the existing nullable `sender_id`
plus `metadata.sender_type = ai`; no fake Auth user/password exists.

## Admin AI Management

`/admin/ai` reuses the shared layout, theme, Input, Button and Lucide icon system.
The existing Admin header links to it. Supported settings: name, description, avatar URL,
welcome message, enabled state, encrypted URL/secret and timeout. UI exposes enabled state,
webhook presence, endpoint hostname, connection status, timeout, last connection test,
latency, last error and update time. Configuration changes and connection tests are shown
from `admin_audit_logs`; secrets and full webhook URLs are never written to audit details.

Saving never returns plaintext credentials; blank replacement inputs preserve existing
values. Test Connection calls the saved workflow from the server. It can run while AI is
disabled, allowing validation before enabling. User profile API returns only public fields.

## Files Created

All paths below are relative to `chatly/` unless prefixed `docs/`:

- `src/app/(chat)/admin/ai/page.tsx`
- `src/app/api/admin/ai/route.ts`
- `src/app/api/admin/ai/test/route.ts`
- `src/app/api/assistant/route.ts`
- `src/app/api/assistant/messages/route.ts`
- `src/components/admin/assistant-settings.tsx`
- `src/components/chat/assistant-entry.tsx`
- `src/components/chat/assistant-sources.tsx`
- `src/lib/assistant/schema.ts`
- `src/lib/assistant/crypto.ts`
- `src/lib/assistant/gateway.ts`
- `src/lib/assistant/server.ts`
- `src/types/assistant.ts`
- `supabase/migrations/20260929010000_ai_conversation_type.sql`
- `supabase/migrations/20260929020000_chat_assistant.sql`
- `e2e/chat-assistant.spec.ts`
- `e2e/assistant-rbac.spec.ts`
- `scripts/test-chat-assistant-db.mjs`
- `docs/N8N_AI_CHAT.md` (repository root)
- `docs/N8N_AI_INTEGRATION_REPORT.md` (repository root)
- `scripts/prepare-tailwind.mjs`
- `scripts/vendor/tailwindcss-oxide-wasm32-wasi-4.2.3.tgz`

## Files Modified

- `.env.example`: server-only assistant key and allowlist.
- `package.json`, `package-lock.json`: explicit `server-only@0.0.1` dependency, also
  resolves the server boundary marker in Node handler tests.
- `src/types/database.ts`: AI enum and table/RPC type extensions.
- `src/lib/conversation-summary.ts`: preserve AI conversation type.
- `src/components/chat/chats-list.tsx`: entry, title/avatar/search handling.
- `src/components/chat/chat-view.tsx`: AI branch in existing send flow, shared bubbles,
  safe sources, typing, errors, text-only AI controls and navigation guards.
- `src/components/notifications/realtime-notifications.tsx`: handle nullable AI sender
  without invalid profile/block queries; use conversation name/avatar for notifications.
- `src/components/admin/admin-dashboard.tsx`: navigation link.
- `src/app/(chat)/settings/page.tsx`: direct Admin link to n8n AI settings.
- `src/lib/supabase/middleware.ts`: preserve refreshed cookies across auth redirects.
- `src/app/pwa-icon/[size]/route.tsx`: use a relative icon redirect so reverse proxies do
  not leak an internal hostname into the browser redirect.
- `e2e/support/call-users.ts`: support requested fixture count, preserving two-user default.

## Database Changes

- Add enum value `ai`; no existing value/table/data removed.
- New `chat_assistant_config`: singleton, defaults disabled, no browser table privileges.
- New `chat_assistant_requests`: request ID, owner/conversation, content, status/error/time;
  no browser table privileges.
- Unique indexes: one AI conversation per user, one processing request per conversation,
  one assistant response per request ID. Rate-limit index covers owner/time.
- Three RPCs: `open_chat_assistant`, `begin_chat_assistant_request`,
  `finish_chat_assistant_request`. Execute restricted to service_role.
- Guard triggers protect AI conversation identity, membership and direct message inserts,
  including writes via existing SECURITY DEFINER helpers. Scheduling AI messages is rejected
  at insertion/update so invalid AI jobs cannot reach the existing scheduling worker.
- Existing `messages` publication/RLS handles AI history and realtime. No new publication
  or globally subscribed AI table is introduced.

## Migration

Apply `20260929010000` first and commit; then `20260929020000`. PostgreSQL must commit a new
enum value before later transactions use it. These files have only been exercised against
an isolated local PostgreSQL fixture. No production SQL was executed by this task.

## API Endpoints

| Method | Path                      | Access / purpose                                   |
| ------ | ------------------------- | -------------------------------------------------- |
| GET    | `/api/assistant`          | Active authenticated user; public profile only     |
| POST   | `/api/assistant`          | Open/reuse own AI conversation                     |
| POST   | `/api/assistant/messages` | Own AI conversation; text/request ID only          |
| GET    | `/api/admin/ai`           | Admin; masked configuration/status                 |
| PUT    | `/api/admin/ai`           | Admin; validate/encrypt/save configuration         |
| POST   | `/api/admin/ai/test`      | Admin; invoke saved workflow and validate response |

## Security

Backend checks the real Supabase user and profile role/suspension. Normal users receive
403 from all admin handlers; missing auth receives 401. Membership and owner/type checks
run before service-role writes; database functions repeat authorization checks.

Mutations require same-origin Origin headers. Zod strict inputs reject userId/role/URL
spoofing in the chat endpoint. Requests are capped at 40,000 bytes; input text at 8,000
characters. N8n responses are limited to 256 KiB, 32,000 text characters and 20 sources.
Both returned IDs must match the request. UI renders text using React escaping and safe
links; no HTML execution. Only HTTP/HTTPS source links are accepted.

SSRF protection requires exact server-managed HTTPS origin allowlisting, rejects embedded
credentials/IP literals/redirects, resolves public IPv4, and pins the verified address to
the TLS request. No internal-network allowlist bypass exists in V1.

## Encryption

Webhook URL and Header Auth secret are stored together using AES-256-GCM, fresh 12-byte IV,
authentication tag and fixed versioned AAD. Key: `AI_CONFIG_ENCRYPTION_KEY`, base64 32 bytes.
No real secret appears in documentation, API output or application logs.

## Realtime

Both human and AI messages use `messages`. User message ID is generated before optimistic
rendering and reused in the database, avoiding optimistic/INSERT duplication. AI replies
are unique by request ID and rendered through the existing message subscription. The
existing unread RPC uses `IS DISTINCT FROM`, which accounts for nullable AI senders.

Existing in-app notification suppression applies while the conversation is visibly open;
outside it, notifications use AI title/avatar. No separate AI Web Push dispatch is added.
No new WebSocket server or polling loop is introduced.

## Message Flow

1. Existing composer validates text; AI path creates a UUID and displays optimistic text.
2. API authenticates user, checks membership/type/owner and validates bounded input.
3. Transaction locks the user, checks enabled/rate/busy state, claims request ID and saves
   the user message. Duplicate IDs return the existing state without invoking n8n.
4. Server loads/decrypts saved configuration; gateway sends Header Auth request with
   stable session ID and AbortController timeout.
5. Gateway validates response size/schema/correlation IDs.
6. Transaction saves nullable-sender AI message, completes request and updates activity.
7. Existing realtime renders reply; local typing ends. Errors retain saved user text and
   show a generic message. Network uncertainty does not automatically retry the workflow.

## n8n Request

```json
{
  "version": "1.0",
  "event": "chat.message.created",
  "requestId": "11111111-1111-4111-8111-111111111111",
  "conversation": { "id": "22222222-2222-4222-8222-222222222222" },
  "message": {
    "id": "11111111-1111-4111-8111-111111111111",
    "text": "Xin chào",
    "createdAt": "2026-09-29T00:00:00.000Z"
  },
  "user": { "id": "33333333-3333-4333-8333-333333333333", "role": "USER" },
  "session": { "id": "22222222-2222-4222-8222-222222222222" }
}
```

## n8n Response

```json
{
  "ok": true,
  "requestId": "11111111-1111-4111-8111-111111111111",
  "conversationId": "22222222-2222-4222-8222-222222222222",
  "assistant": {
    "text": "Xin chào! Tôi có thể giúp gì cho bạn?",
    "format": "markdown",
    "sources": []
  }
}
```

## Environment Variables

New: `AI_CONFIG_ENCRYPTION_KEY`, `N8N_ALLOWED_ORIGINS` (server-only).
Existing: `SUPABASE_SERVICE_ROLE_KEY`, public Supabase URL/anon key.
Timeout defaults to 120000 in DB and is changed through Admin; no duplicate timeout ENV.
No `.env.local` or production credential was changed.

## Testing Results

Final checks: **lint passed**, **strict TypeScript passed**, **54/54 Playwright runs passed**
(27 cases across desktop Chromium and mobile Chromium). Browser/API requests ran against
the Linux production server on local port 3107; gateway/handler tests ran in isolated test
workers. The suites were `chat-assistant`, `assistant-rbac`, `session-redirect` and `app-shell`.
Existing public UI, accessibility, PWA icons, security headers and anonymous redirects also passed.

An authenticated Admin smoke check also opened `/chats`, `/settings`, `/admin` and
`/admin/ai`. The AI page displayed the full n8n setup and status sections.

The focused suites exercise gateway success/auth/body/session, timeout, 500, redirect,
invalid JSON/schema, mismatched IDs, response size, SSRF, encryption/tamper detection,
input spoofing, unauthenticated access, CSRF, admin RBAC/suspension, masked configuration,
save/disable and rejecting human/other-user conversations. Handler role/config tests use
controlled auth/DB mocks; gateway tests use a local HTTP server injected as test transport.

Local PostgreSQL fixture: **11 assertions + 20 rejected-operation checks passed**. Includes
reuse/isolation, concurrent idempotency, unique reply, owner-only history, disabled/suspended
state, rate limiting, rejecting AI scheduling, direct-write protection and human/group attachment inserts. This fixture imports
base chat migrations plus relevant columns; it is not the full production Supabase stack.

Full authenticated browser → live n8n → deployed Supabase Realtime testing remains an owner
staging step. There is no claim that production or real model output has been exercised.

## Production Build Result

`npm run dev` and `npm run build` run directly on Windows. The preparation step supplies
the WASM binding and explicit Tailwind candidates when Windows Application Control blocks
native SWC/Tailwind bindings. Local Chatly no longer creates or requires a Docker container.

## Vercel Setup

Apply the two reviewed migrations, set server-only environment variables, ensure Node
Function duration supports 150 seconds, then redeploy. New assistant starts disabled.
Publish the n8n workflow before saving/testing its Production URL. Keep the existing
Supabase Realtime publication and hosting settings. See the setup document for exact steps.

## Remaining Risks

- Live deployment/migrations/n8n credentials are not configured by this task; staging E2E
  is still needed, including mobile chat, reconnect duplication, unread and notifications.
- AI disabling prevents new calls; it does not cancel an already running workflow.
- Process termination after n8n side effects but before reply persistence can leave an
  uncertain request. There is no blind retry; downstream side-effect tools should dedupe
  using requestId. Stale processing locks are released on a later send after 3 minutes.
- User attachment upload to AI remains disabled until the private Storage/RLS flow is enabled. The
  version 1.1 request contract already includes `attachments: []`, and rich output from n8n is
  validated, persisted and rendered as safe links. Rich Markdown/streaming are not implemented.
- Config changes update existing AI conversation title/avatar. Welcome text applies to
  new conversations; memory remains owned by n8n.
- The pre-existing untracked multi-agent feature is preserved and not migrated into this
  singleton assistant. Review it separately before committing/deploying the entire workspace.

## Manual Steps for Owner

Follow [N8N_AI_CHAT.md](N8N_AI_CHAT.md). It includes migration order, environment/key creation,
Header Auth, all 24 n8n/Admin/User setup steps, exact prompt/memory expressions, a copyable
Format Output Code node, Respond to Webhook expression and troubleshooting.
