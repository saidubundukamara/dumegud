# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project status

DuMeGud is a creator-support and digital-commerce platform for Sierra Leone (one-off contributions + digital product sales, paid via Monime mobile money). **Phases 0–8 (foundations, auth, creator profile & wallet, Monime core + webhook, one-off support, digital products, KYC & payouts, risk & compliance, admin dashboard) are done**; Phase 9 (background jobs & reconciliation) is next. The product spec and the build plan live in two documents. Read them before implementing anything:

- `PRD.md`: product requirements (what and why).
- `implementation.md`: the phased engineering plan (how). Its **Decision log (§0)** overrides the PRD where they differ (e.g. auth is **NextAuth/Auth.js v5**, not Better Auth). Build phases in order (0 → 10). Each phase lists its tables, services, routes and acceptance checks.

## Commands

```bash
npm run dev            # next dev (Turbopack is the default; no flag needed)
npm run build          # next build (does NOT run lint in Next 16)
npm run lint           # ESLint CLI with flat config (`next lint` no longer exists)
npm run typecheck      # next typegen && tsc --noEmit (typegen creates PageProps/LayoutProps/route types)
npm test               # Vitest, unit + integration (tests/unit, tests/integration)
npx vitest run tests/unit/money.test.ts     # single file
npx vitest run -t "floors, never rounds"    # single test by name
npx vitest run tests/integration            # real-SQL tests: every migration on PGlite (in-process Postgres)
npm run test:e2e       # Playwright: builds + starts the app itself (or set E2E_BASE_URL)
PW_CHANNEL=chrome npm run test:e2e          # use installed Chrome if the Playwright browser download fails
npm run db:generate    # drizzle-kit: schema → SQL migration in server/db/migrations
npm run db:migrate     # apply migrations (uses DATABASE_URL_MIGRATOR, falls back to DATABASE_URL)
```

Env: copy `.env.example` → `.env.local`. `server/env.ts` validates lazily (first `getEnv()` call), so `build` works without secrets. Add new variables to both files when a phase needs them. `tests/setup.ts` stubs `server-only` and sets test env values.

## Next.js 16.4 specifics in this repo

- `next.config.ts` enables **`cacheComponents`** and **`partialPrefetching`**:
  - Runtime reads (`cookies()`, `headers()`, `params`, `searchParams`) outside `<Suspense>` are build errors.
  - `'use cache'` scopes can't read request data.
  - Segment configs like `export const dynamic`/`revalidate` are removed.
- Middleware is **`proxy.ts`** (Node runtime only). Use it for optimistic auth redirects only, never real authorization.
- CSP and security headers are **static**, in `next.config.ts` `headers()`. Don't switch to a nonce CSP: it's incompatible with Partial Prerendering. If a phase adds a new external origin (R2 images, Monime), extend the CSP there. The E2E suite fails on any CSP violation.
- Request APIs and `params`/`searchParams` are Promises. Use the global `PageProps<'/route'>`, `LayoutProps`, `RouteContext` type helpers (already used in `app/layout.tsx`).
- `revalidateTag` requires a second argument. `updateTag` works only in Server Actions.
- Tailwind 4 runs through the `@tailwindcss/turbopack` loader configured in `next.config.ts` (there's no PostCSS config). Brand values live only in `styles/tokens.css` and are mapped to Tailwind utilities (`bg-primary`, `text-muted`, …) in `app/globals.css`.
- `@/*` maps to the repo root (there's no `src/` directory).

## Architecture (see `implementation.md` §2–3)

- **Layering:** Server Action / Route Handler (thin: validate with Zod, get session from the DAL, call one service) → **Service** (`server/services`, business rules + authorization + integrations) → **Repository** (`server/repositories`, extends `BaseRepository`, the only layer that touches Drizzle; ESLint blocks importing `@/server/db/client` elsewhere). Repository methods accept an optional `tx` from `runInTransaction` (`server/services/transaction.ts`). Wiring happens in `server/services/index.ts`. **Never call Monime/R2/email inside a DB transaction.** Write the intent row, commit, call the provider, then record the result.
- **Data:** Neon Postgres + Drizzle using the `neon-serverless` Pool driver (interactive transactions needed). Money is always integer **minor units of SLE** (1 Le = 100). Use `lib/money.ts` (`parseMajorToMinor`, `bpsOf` floors, `formatSLE`). Table helpers (`id`, `timestamps`) are in `server/db/schema/columns.ts`, and new table files are re-exported from `server/db/schema/index.ts`.
- **Payments (Monime):**
  - Every checkout pays into the platform financial account.
  - A signed webhook (`/api/webhooks/monime`) settles the payment, and an internal transfer moves the net amount to the creator's own Monime financial account. That account is created at sign-up with a deterministic idempotency key.
  - Fees are deducted from the amount given.
  - Withdrawals are Monime payouts with the fee charged on top.
  - The reference implementation and its gotchas come from the sibling repo `../ib4me`. Summarised gotchas are in `implementation.md` §3 and Appendix B.
- **Auth:** Auth.js v5 (Credentials + Google, JWT sessions, Argon2id), with DB-checked `sessionVersion` for revocation in `server/dal/session.ts`. Every Server Action and Route Handler re-verifies auth (`verifySession()` / `requireRole()`); `proxy.ts` only does optimistic redirects for `/dashboard` and `/admin`. `auth.config.ts` must stay free of DB/env imports (the proxy loads it). Login rate limits live in `AuthService.verifyCredentials` because Auth.js also exposes the credentials callback as a route. Form actions return `FormState` (`lib/form-state.ts`) via `runForm`/`invalidForm` (`server/lib/form.ts`). Post-response work (emails) runs in `after()`; `services.auth.onUserCreated` is the hook Phase 2 extends with wallet provisioning.
- **Creators:** `CreatorService` (profile, handles, publish checklist), `WalletService.provisionForCreator` (idempotent, key `creator-wallet-{userId}`), `AvatarService` (R2 presigned PUT → sharp re-encode). Public pages read `getCachedPublicProfile` (`'use cache'`, tags from `server/lib/cache-tags.ts`); every profile-changing action must `updateTag` the tags from `profileChangeTags(change)`. `MONIME_ENVIRONMENT=fake` runs the real client against an in-memory `FakeMonimeServer` (`server/integrations/monime/fake.ts`), which also drives scenarios (`completeCheckout`, `settlePayout`) for tests and the dev simulator `/api/dev/monime-webhook`.
- **Webhooks:** `/api/webhooks/monime` → `WebhookService.handleMonime` (claim in `webhook_events`, dispatch by event name). Register handlers in the `services.webhooks` map in `server/services/index.ts`; handlers must be idempotent and order-independent, throw `WebhookRetryLater`/`WebhookRejected`, and return cache tags to revalidate. Read Monime fees/failures only via `sumMonimeFees` / `describeMonimeFailure` / `resolveCheckoutSessionId`.
- **Payments:** `ContributionService.start` (payment row → Monime checkout outside the tx → `pending`), `SettlementService` (webhook handlers; row lock, order-independent, split once via `lib/fees.ts`, ledger journals from `server/services/ledger.ts`), `TransferService` (one transfer per payment; key `transfer-{paymentId}-{definitiveFailures}`). Status changes only through `PaymentRepository.transition` with the `ALLOWED_FROM` table in `payment-state.ts`. Fees and limits come from `PlatformSettingsService` (DB, placeholders), never constants in UI code.
- **Shout-outs:** supporters can add a self-declared social handle with explicit consent (`contributions.shoutout_consent`), in the support widget or on the Thank-you page through the `dmg_support_claim` cookie. `lib/traffic-source.ts` records `payments.traffic_source` from `?via=` share links, the in-app browser UA or the referrer, all read client-side so the public page stays cached. `ShoutoutService` builds the creator's thank-you caption (`lib/shoutout.ts`) and the `/api/shoutouts/image` card. Top supporters are grouped by payer fingerprint and never show amounts. Anonymous support is never named.
- **Products:** `ProductService` (owner-scoped drafts, presigned uploads verified by size + magic bytes, submit for review), `ProductReviewService` (staff), `OrderService` (purchase start, settlement fulfilment = entitlement in the success tx + one receipt, library, recovery), `DownloadService` (60s HMAC token → atomic count → 5-min presigned GET, PDF stamping). Personal data that must be readable uses `encryptField`/`decryptField` (`server/lib/crypto.ts`); lookups use `pepperedHash`.
- **Payouts:** `KycService` (private-bucket documents, staff decisions), `PayoutMethodService` (provider-KYC holder check, cooldowns), `BalanceService` (min(live, ledger), fail closed), `PayoutService` (fee on top; unknown Monime outcomes stay `requested` and are re-sent with the same key; completion applied once under a row lock).
- **Compliance:** staff and security-relevant mutations call `AuditLogger.log` (append-only `audit_logs`, trigger-enforced). Gate creator features with `RestrictionGuard.assertAllowed(userId, "receive"|"withdraw"|"publish"|"upload")`. Limits come from `transaction_limits` via `LimitService` (precheck/postcheck/payoutCheck); risk rules raise alerts via `RiskService` (signals only, never restrictions). Inside a transaction, pass `tx` to **every** repository call (PGlite deadlocks otherwise, and on Neon the read escapes the transaction).
- **Admin:** every admin page/action calls `requireRole("staff","super_admin")`; sensitive actions call `requireStaffStepUp()` **inside** `runForm` (password re-entry within 10 min, cookie bound to `sessionVersion`). New admin actions must live in an `actions.ts` under `app/(admin)` so `tests/unit/admin-guards.test.ts` checks them, and must write an audit row (via a service).
- **Errors:** services throw `AppError` subclasses (`server/lib/errors.ts`); actions wrap their body in `toActionResult`, and route handlers use `toHttpResponse`.
- **Security baseline** (`implementation.md` §4): `assertSameOrigin` for mutating route handlers, `enforceRateLimit(policy, id)` with policies centralised in `server/lib/rate-limit.ts` (Upstash, or in-memory when unconfigured), `pepperedHash` before storing IPs or identifiers, and the logger redacts PII keys. ESLint bans `sql.raw` and `dangerouslySetInnerHTML`.
- **Branding:** always spell it **DuMeGud**. The color palette isn't final: use swappable semantic CSS tokens, never hardcoded brand colors.
