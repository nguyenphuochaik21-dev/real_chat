# Repository Guidelines

## Project Structure & Module Organization

The root holds product documentation in `docs/` and planning notes in `PLAN.md`. The runnable Next.js 16 App Router application lives in `chatly/`. Within `chatly/src/`, route groups are under `app/(auth)` and `app/(chat)`; reusable UI is in `components/`; hooks, Zustand stores, server actions, Supabase clients, and shared types live in `hooks/`, `stores/`, `lib/`, and `types/`. Put static files in `public/` and append-only SQL migrations in `supabase/migrations/`.

When changing the application, also follow `chatly/AGENTS.md`, especially its requirement to consult the installed Next.js documentation before relying on framework conventions.

## Build, Test, and Development Commands

Run commands from `chatly/`:

- `npm ci` installs the exact lockfile dependency set.
- `npm run dev` starts the local development server.
- `npm run lint` checks ESLint rules; `npm run lint:fix` applies safe fixes.
- `npm run typecheck` runs strict TypeScript validation.
- `npm run build` creates a production build and catches rendering errors.
- `npm run format` formats the repository with Prettier and sorts Tailwind classes.

## Coding Style & Naming Conventions

Use two-space indentation, single quotes, no semicolons, trailing ES5 commas, and a 100-character line limit. Prettier and ESLint are authoritative. Prefer the `@/` alias for `src/` imports. Use PascalCase for components and types, camelCase for functions, `UPPER_SNAKE_CASE` for constants, kebab-case component files (for example, `chat-view.tsx`), and `use-` prefixes for hook files. Default to Server Components; add `'use client'` only for state, effects, or browser APIs. Avoid `any`, inline styles, and comments that restate code.

## Testing Guidelines

No test runner or coverage threshold is configured. Every change must pass `npm run lint` and `npm run typecheck`; run `npm run build` for routing, configuration, or data-flow changes. If adding tests, colocate `*.test.ts(x)` with the subject and add the framework dependency and test command in the same change.

## Commit & Pull Request Guidelines

Recent history favors Conventional Commit prefixes such as `feat:`, `fix:`, `chore:`, and `docs:`. Use an imperative, specific subject (for example, `fix: preserve unread state after reconnect`) rather than vague messages. Pull requests should summarize behavior changes, list validation performed, link relevant issues or tasks, include screenshots for UI changes, and call out new environment variables or Supabase migrations.

## Security & Configuration

Keep secrets in ignored `.env.local`; never commit credentials. Required public variables include Supabase URL/anon key, with optional VAPID and TURN settings. Review row-level security implications whenever changing migrations or server actions.
