# Chatly production audit — 2026-09-10

## Outcome

The deployed application, local production build, application code, and linked Supabase database
were reviewed. No known dependency vulnerability, schema-lint error, migration drift, blocking
database query, or critical accessibility violation was found.

The production URL was inspected while authenticated in the existing Chrome session for chats,
contacts, settings, appearance, support, and administration. Public routes, redirects, PWA assets,
headers, responsive behavior, and accessibility were also exercised through automated browser
tests on desktop and a Pixel 7 viewport.

## Fixes applied

- Added missing auth-page `main` landmark and 40 px password visibility controls with accessible
  names and alert semantics.
- Made service-worker registration tolerate unavailable/blocked registrations and lazy-loaded push
  code only when it is needed.
- Deferred the install prompt until the first user interaction so it does not become a late LCP
  element.
- Lazy-loaded the Supabase browser client on auth actions instead of shipping it in the initial
  anonymous-page path.
- Added `script-src-attr`, `worker-src`, and `manifest-src` CSP restrictions.
- Enforced the 5 MB image-proxy limit while streaming, including responses without a
  `Content-Length` header.
- Removed a redundant authenticated-user request from the calls page and connected the previously
  inert call-history redial button.
- Replaced the inaccurate end-to-end-encryption claim. Chatly currently protects data with Supabase
  authentication, authorization, and row-level security; it does not implement E2EE.

## Verification

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed with Next.js 16.3.4; all 26 routes generated successfully.
- `npm run test:e2e`: 14 passed, 1 skipped. The skipped test performs authenticated group mutations
  and requires dedicated E2E credentials plus two accepted friends.
- `npm audit --omit=dev`: 0 known vulnerabilities.
- Supabase migration list: all 47 local migrations match production.
- `supabase db lint --level warning`: no schema errors.
- Lighthouse on the optimized local production `/login`: Performance 97, Accessibility 100, Best
  Practices 100, SEO 100; FCP 0.8 s, LCP 2.7 s, TBT 20 ms, CLS 0. Scores vary by machine and run.

## Production observations and remaining release checks

- The currently deployed pre-fix build measured 94 Performance, 94 Accessibility, 100 Best
  Practices, and 100 SEO on `/login`.
- The production CSP still permits inline scripts/styles because the current static/CDN-friendly
  Next.js setup does not use request-scoped nonces. Moving to nonce-based CSP is a separate tradeoff
  that would make affected pages dynamic.
- WebRTC camera/microphone/TURN behavior, installed-PWA push delivery, and notification audio still
  require physical-device testing. Automated destructive tests were not run against real user data.
- Vercel CLI was logged out on this machine, so the optimized build could not be deployed directly
  from the audit session without using the repository's deployment integration or authenticating
  the CLI.
