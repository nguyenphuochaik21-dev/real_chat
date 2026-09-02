# Chatly

Chatly is a Vietnamese-first realtime messaging application built with Next.js 16, React 19,
Supabase, Tailwind CSS, and Zustand. It includes direct messaging, media, search, notifications,
message actions, and WebRTC voice/video calling.

## Local development

Copy the required Supabase values into `.env.local`, then run:

```bash
npm ci
npm run dev
```

The application is available at `http://localhost:3000`. Supabase schema changes are append-only
files under `supabase/migrations/` and must be applied to the target project before testing a
feature that depends on new tables or policies.

Copy `.env.example` to `.env.local`. Background notifications additionally require a VAPID key
pair (`npx web-push generate-vapid-keys`) and the Supabase service-role key. The private VAPID and
service-role keys are server-only and must never use a `NEXT_PUBLIC_` prefix.

Apply pending local migrations to a linked development project with:

```bash
npx supabase db push
```

## Quality checks

```bash
npm run lint
npm run typecheck
npm run build
```

Project architecture and roadmap documentation live in the repository-level `docs/` directory.
The compact handoff reference is `../memory/chatly-context.md`.
