# DuMeGud — Implementation Plan

**Version:** 1.0
**Date:** 15 October 2026
**Source of truth for scope:** `PRD.md` (v1.2)
**Monime reference implementation:** `../ib4me` (production-proven Monime integration)
**Framework docs:** `node_modules/next/dist/docs/` (Next.js **16.4.0**). Always re-check there before writing code; this version differs from older Next.js.

---

## Table of contents

- [0. Decision log](#0-decision-log)
- [1. Engineering conventions](#1-engineering-conventions)
- [2. Architecture & folder layout](#2-architecture--folder-layout)
- [3. Money model (read before touching payments)](#3-money-model-read-before-touching-payments)
- [4. Security: threat model & controls](#4-security-threat-model--controls)
- [Phase 0 — Foundations](#phase-0--foundations)
- [Phase 1 — Authentication & accounts](#phase-1--authentication--accounts)
- [Phase 2 — Creator profile, handle & wallet provisioning](#phase-2--creator-profile-handle--wallet-provisioning)
- [Phase 3 — Monime integration core](#phase-3--monime-integration-core)
- [Phase 4 — One-off support (contributions)](#phase-4--one-off-support-contributions)
- [Phase 5 — Digital products & secure delivery](#phase-5--digital-products--secure-delivery)
- [Phase 6 — Wallet, KYC, payout methods & withdrawals](#phase-6--wallet-kyc-payout-methods--withdrawals)
- [Phase 7 — Risk, limits & compliance](#phase-7--risk-limits--compliance)
- [Phase 8 — Admin dashboard](#phase-8--admin-dashboard)
- [Phase 9 — Background jobs & reconciliation](#phase-9--background-jobs--reconciliation)
- [Phase 10 — Hardening, observability & pilot launch](#phase-10--hardening-observability--pilot-launch)
- [Appendix A — Environment variables](#appendix-a--environment-variables)
- [Appendix B — Monime API reference (as used)](#appendix-b--monime-api-reference-as-used)
- [Appendix C — Sequence flows](#appendix-c--sequence-flows)
- [Appendix D — Data model summary](#appendix-d--data-model-summary)
- [Appendix E — PRD acceptance criteria → phase → test](#appendix-e--prd-acceptance-criteria--phase--test)
- [Appendix F — Open items](#appendix-f--open-items)

---

## 0. Decision log

These decisions were confirmed for implementation. Where they differ from `PRD.md`, this document wins and the PRD should be updated.

| Area | Decision | Notes |
|---|---|---|
| Framework | Next.js 16.4 App Router, React 19.3, TypeScript strict, Tailwind 4 | `cacheComponents` + `partialPrefetching` already enabled in `next.config.ts` |
| Auth | **NextAuth / Auth.js v5** (`next-auth@5.0.0-beta.x`, pin exact) | **Overrides PRD's "Better Auth".** Credentials (email+password) + Google. |
| Session strategy | **JWT** (required by the Credentials provider) + DB-backed revocation via `sessionVersion` | See Phase 1 |
| Password hashing | **Argon2id** via `@node-rs/argon2` | Auto-externalized by Next 16 (`serverExternalPackages` built-in list) |
| Code structure | **Repository** (DB only) → **Service** (logic) → thin Server Actions / Route Handlers | See §2 |
| Database | Neon Postgres, **Drizzle ORM + Drizzle Kit**, `drizzle-orm/neon-serverless` (Pool/WebSocket) driver | Interactive transactions are required; the `neon-http` driver can't do them |
| Payments | **Monime** (Orange Money `m17`, AfriMoney `m18`) via hosted checkout sessions | USSD payment codes are **out of scope** |
| Wallet | One **Monime financial account per creator, created at sign-up** | Idempotent; retried by cron if Monime fails. Adding a payout method only unlocks *withdrawals* |
| Funds flow | **Platform-first, as in ib4me.** Checkout pays into the DuMeGud platform account → verified webhook → **internal transfer** of the net amount to the creator wallet. The platform fee stays in the platform account | §3 |
| Fees | **Deducted from the amount given.** Supporter pays exactly the listed amount. Monime nets its fee before settlement; the platform fee is taken from what arrived | §3 |
| KYC | **Manual admin review.** ID document uploaded to private R2, staff approve. Plus Monime **provider-KYC** holder-name match on the payout number | Phase 6 |
| Email | **Cloudflare Email Sending** behind an `EmailService` interface; `EMAIL_ENABLED` and `EMAIL_PROVIDER` toggles in `.env` | `console` provider when disabled / in dev |
| File storage | Cloudflare R2, private bucket, presigned URLs only | Phase 5 |
| Hosting | **Vercel** (Fluid Compute, Node runtime). Vercel Cron → `/api/cron/*` | Phase 9 |
| Rate limiting | Upstash Redis (`@upstash/ratelimit`) via Vercel Marketplace + Vercel Firewall rules | §4 |
| Currency | `SLE`, integer **minor units** (1 Le = 100) everywhere | Never floats |

---

## 1. Engineering conventions

### 1.1 Next.js 16.4 rules (verified against `node_modules/next/dist/docs`)

| Topic | Rule | Doc |
|---|---|---|
| Middleware | **`middleware.ts` is deprecated → use `proxy.ts`** exporting `proxy` (or default). Node runtime only (can't be configured). Use it only for **optimistic** cookie checks and redirects. **Never** for real authorization or DB access. | `03-api-reference/03-file-conventions/proxy.md` |
| Server Functions | Reachable by direct POST. **Every Server Action re-verifies session + authorization.** A proxy matcher that skips a path also skips actions on it. | `02-guides/server-actions.md`, `02-guides/data-security.md` |
| Forms | `<form action={serverAction}>` + `useActionState(action, initial)` → action signature `(prevState, formData)`. Zod v4 validation on the server. Return DTOs / `{ ok, errors }`, never DB rows. | `02-guides/forms.md` |
| Async request APIs | `cookies()`, `headers()`, `draftMode()`, `params`, `searchParams` are **Promises**. Sync access is removed. | `02-guides/upgrading/version-16.md` |
| Typed props | Use the global helpers `PageProps<'/[handle]'>`, `LayoutProps<'/dashboard'>`, `RouteContext<'/api/downloads/[token]'>` | `05-config/02-typescript.md` |
| Cache Components | Dynamic by default. Runtime reads (`cookies`, `headers`, `params`) outside `<Suspense>` are build errors. `'use cache'` can't read cookies/headers. Pass values in. Always pair with `cacheLife`. | `01-getting-started/08-caching.md` |
| Per-user cache | `'use cache: private'` for session-dependent reads (browser-only cache). **Never put PII, tokens or emails in cache keys/tags.** Tag by internal IDs only. | `03-api-reference/01-directives/use-cache-private.md` |
| Invalidation | `updateTag(tag)` **only in Server Actions** (read-your-writes). In Route Handlers / webhooks use `revalidateTag(tag, 'max')`. The **single-argument `revalidateTag` is deprecated.** | `04-functions/updateTag.md`, `revalidateTag.md` |
| Non-determinism | Call `await connection()` before `Date.now()`, `crypto.randomUUID()`, `Math.random()` or runtime `process.env` reads in render paths | `04-functions/connection.md` |
| Removed configs | No `export const dynamic/revalidate/fetchCache/dynamicParams`. No `runtime = 'edge'`. | `05-config/01-next-config-js/cacheComponents.md` |
| Post-response work | `after()` from `next/server` for emails, wallet provisioning kick-off, risk evaluation | `04-functions/after.md` |
| Auth interrupts | Enable `experimental.authInterrupts` and use `forbidden()` / `unauthorized()` with `forbidden.tsx` / `unauthorized.tsx` | `04-functions/forbidden.md` |
| Errors | `error.tsx` receives `{ error, retry }` (prefer `retry()` over `reset()`) | `03-file-conventions/error.md` |
| Images | `priority` is deprecated → `preload` / `fetchPriority="high"`. Use `remotePatterns` (not `domains`). | `02-components/image.md` |
| Lint | `next lint` is removed. Use the `eslint` CLI with the existing flat config. `next build` doesn't lint. | `05-config/03-eslint.md` |
| Typed routes | Enable top-level `typedRoutes: true` | `05-config/01-next-config-js/typedRoutes.md` |
| Server-only | `import 'server-only'` at the top of every file under `server/` | `02-guides/data-security.md` |
| Instrumentation | `instrumentation.ts` with `register()` and `onRequestError` (typed `Instrumentation.onRequestError`) | `02-guides/instrumentation.md` |

### 1.2 Code conventions

- **TypeScript strict.** No `any` across layer boundaries.
- **Money:** a `Minor` type alias over `number` (safe-integer checked). All arithmetic goes through `lib/money.ts`. Display formatting goes through `formatSLE(minor)`.
- **IDs:** `uuid` v7 (time-sortable) primary keys, generated in the DB (`gen_random_uuid()` or an app-side v7 helper). External IDs (Monime `fac-`, `scs-`, `spm-`, `pyt-`, `tfr-`) are stored in their own unique columns.
- **Time:** `timestamptz` everywhere, UTC.
- **Validation:** Zod v4 schemas live in `server/validation/*` and are shared by actions and route handlers.
- **Errors:** services throw typed `AppError` subclasses (`NotFoundError`, `ForbiddenError`, `ValidationError`, `ConflictError`, `RateLimitedError`, `ExternalServiceError`). Actions and route handlers map them to user-safe results/HTTP codes in one helper (`toActionResult`, `toHttpResponse`).
- **Logging:** structured JSON logger (`server/lib/logger.ts`) with redaction of `password`, `token`, `phone`, `email`, `msisdn`, `authorization`.
- **Tests:** Vitest (unit/integration), Playwright (E2E). A test lives next to the module it tests in `tests/` mirrors.
- **No external HTTP calls inside DB transactions.** This rule is load-bearing; ib4me suffered orphaned Monime accounts and timeouts from it. Pattern: *write intent row → commit → call provider → write result*.

---

## 2. Architecture & folder layout

### 2.1 Layers

```
 Client Component / <form>
          │
          ▼
 Server Action ('use server')  ──or──  Route Handler (app/api/**/route.ts)
   - parse + Zod-validate input            - verify signature / CRON_SECRET / session
   - get session via DAL                   - parse + validate
   - call ONE service method               - call service
   - map result → DTO / redirect / updateTag
          │
          ▼
 Service (server/services/*Service.ts)   ← business rules, authorization, orchestration,
          │                                 transactions, calls integrations
          ├──────────────► Integration (server/integrations/monime|r2|email)  (HTTP)
          ▼
 Repository (server/repositories/*Repository.ts)  ← Drizzle queries only, no business rules
          │
          ▼
 Drizzle schema (server/db/schema/*) → Neon Postgres
```

Rules:
1. **Only repositories import `db` / Drizzle query builders.** Services never write SQL.
2. **Only services call integrations.** Repositories never call HTTP.
3. **Authorization lives in services** (they receive an `Actor` = `{ userId, role, status }`) *and* is re-asserted at the action/route boundary via the DAL. Defense in depth.
4. Services return **domain objects**. Actions map them to **DTOs** before returning them to the client.
5. Every repository method accepts an optional `tx` so services can compose multiple repositories in one transaction.

### 2.2 Folder layout

```
app/
  (marketing)/            page.tsx (landing), about, pricing, legal/{terms,privacy,content-policy,prohibited}
  (auth)/                 login, register, verify-email, forgot-password, reset-password
  (creator)/dashboard/    layout.tsx, page.tsx, profile, products, supporters, orders, wallet, payout-method, verification, settings
  (admin)/admin/          layout.tsx, page.tsx, creators, products, transactions, payouts, kyc, alerts, cases, limits, settings, audit
  [handle]/               page.tsx (public creator page), support/{success,cancel}
  p/[productId]/          page.tsx (product share page), purchase/{success,cancel}
  library/[accessToken]/  page.tsx (buyer access / re-download)
  api/
    auth/[...nextauth]/route.ts
    webhooks/monime/route.ts
    payments/[id]/status/route.ts
    downloads/[token]/route.ts
    uploads/presign/route.ts
    cron/{provision-wallets,retry-transfers,reconcile-payments,reconcile-payouts,ledger-drift,cleanup}/route.ts
  forbidden.tsx  unauthorized.tsx  not-found.tsx  global-error.tsx
auth.ts                  NextAuth() instance (providers, adapter, callbacks), exports { handlers, auth, signIn, signOut }
auth.config.ts           provider-agnostic config shared with proxy (no DB / argon2 imports)
proxy.ts                 optimistic auth redirects (security headers + CSP live in next.config.ts headers())
instrumentation.ts       register() + onRequestError
vercel.ts                cron schedules
server/
  db/client.ts           Neon Pool + drizzle()
  db/schema/*.ts         one file per domain (auth, creators, payments, products, wallet, risk, admin)
  db/migrations/         drizzle-kit output (committed)
  dal/session.ts         getSession(), verifySession(), requireRole(), requireCreator()
  dal/dto.ts             DTO mappers
  repositories/          BaseRepository.ts + *Repository.ts
  services/              *Service.ts + index.ts (singletons)
  integrations/
    monime/{client.ts,types.ts,webhook.ts,fake.ts}
    r2/{client.ts,presign.ts}
    email/{EmailService.ts,cloudflare.ts,console.ts,templates/*}
  validation/*.ts        Zod schemas
  lib/{logger.ts,errors.ts,rate-limit.ts,crypto.ts,origin.ts,cron.ts}
lib/                     isomorphic, pure helpers (safe for client)
  money.ts  fees.ts  phone.ts  handle.ts  format.ts
components/
  ui/                    primitives (Button, Input, Field, Dialog, Toast, Badge, AmountPicker…)
  creator/ admin/ checkout/
styles/tokens.css        design tokens (Direction A temporary palette)
tests/{unit,integration,e2e,fixtures}
```

### 2.3 Repository & transaction pattern

```ts
// server/db/client.ts
import 'server-only'
import { Pool } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import * as schema from './schema'
import { env } from '@/server/env'

const pool = new Pool({ connectionString: env.DATABASE_URL })
export const db = drizzle({ client: pool, schema })
export type DB = typeof db
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0]
export type Executor = DB | Tx
```

```ts
// server/repositories/BaseRepository.ts
import 'server-only'
import { db, type Executor } from '@/server/db/client'

export abstract class BaseRepository {
  protected exec(tx?: Executor): Executor {
    return tx ?? db
  }
}
```

```ts
// server/repositories/CreatorProfileRepository.ts
export class CreatorProfileRepository extends BaseRepository {
  async findByHandle(handle: string, tx?: Executor) {
    const [row] = await this.exec(tx).select().from(creatorProfiles)
      .where(eq(creatorProfiles.handleLower, handle.toLowerCase())).limit(1)
    return row ?? null
  }
  async updateOwned(userId: string, id: string, patch: ProfilePatch, tx?: Executor) {
    // ownership enforced in the WHERE clause — IDOR protection at the data layer
    return this.exec(tx).update(creatorProfiles).set(patch)
      .where(and(eq(creatorProfiles.id, id), eq(creatorProfiles.userId, userId))).returning()
  }
}
```

```ts
// server/services/transaction.ts
export function runInTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(fn) // NEVER call Monime/R2/email inside fn
}
```

```ts
// server/services/index.ts: composition root (singletons, easy to swap in tests)
export const repos = { users: new UserRepository(), creators: new CreatorProfileRepository(), /* … */ }
export const monime = createMonimeClient(env)       // or fake in test
export const email = createEmailService(env)
export const services = {
  auth: new AuthService(repos, email),
  wallet: new WalletService(repos, monime),
  /* … */
}
```

### 2.4 Server Action shape (the template every action follows)

```ts
// app/(creator)/dashboard/profile/actions.ts
'use server'
import { updateTag } from 'next/cache'
import { verifySession } from '@/server/dal/session'
import { services } from '@/server/services'
import { profileUpdateSchema } from '@/server/validation/profile'
import { toActionResult } from '@/server/lib/errors'

export async function updateProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await verifySession()                       // 1. authN (DB-checked)
  const parsed = profileUpdateSchema.safeParse(Object.fromEntries(formData)) // 2. validate (allow-list)
  if (!parsed.success) return { ok: false, errors: parsed.error.flatten().fieldErrors }
  return toActionResult(async () => {
    const profile = await services.creators.updateProfile(session.actor, parsed.data) // 3. authZ inside
    updateTag(`creator:${profile.id}`)                         // 4. invalidate by ID tag (no PII)
    return { ok: true }
  })
}
```

---

## 3. Money model (read before touching payments)

Taken from ib4me `MONIME-FEE-MODEL.md`, `lib/fees.ts`, and `docs/WITHDRAWAL_PROCEDURE.md`. All of it was observed in production.

### 3.1 Accounts (Monime financial accounts)

| Account | Created by | Purpose |
|---|---|---|
| **Platform account** | Manually in the Monime dashboard; ID in env `MONIME_PLATFORM_ACCOUNT_ID` | Receives **every** checkout payment. Keeps platform fees. |
| **Creator wallet** (one per creator) | `WalletService.provisionForCreator` at sign-up | Receives net transfers. Source of payouts. |

### 3.2 Inbound waterfall (support & product purchases)

```
gross            supporter is charged exactly this (the listed amount)
  − monimeFee    REPORTED by Monime in payment.processing_completed data.fees[] (sum the array)
                 fallback estimate: floor(gross × MONIME_COLLECTION_FEE_BPS / 10000), flagged 'estimated'
  = arrived      what physically lands in the platform account
  − platformFee  floor(arrived × platformFeeBps / 10000)   (bps from platform_settings, per kind:
                 contribution vs product; snapshot the bps onto the payment row)
  = creatorNet   internal transfer platform → creator wallet
```

Rules (non-negotiable):
1. **Integer minor units, `Math.floor`, per payment.** Never floor a sum.
2. **The recorded fee beats the estimate.** `null` means "not reported". Never coerce it to `0`.
3. `data.fees` is an **array**. Sum it, never read `[0]`.
4. **Two events per payment** (`checkout_session.completed` has no fees; `payment.processing_completed` has fees). Either can arrive first. Settlement must handle both orders (see Phase 4 `applySettlement`).
5. The internal transfer is made **once the reported fee is known**, or by the reconciliation cron after a grace period using the estimate. Any later fee correction posts a `platform_fee_variance` ledger entry and never re-transfers.
6. A `creatorNet ≤ 0` is never transferred (Monime rejects zero-value transfers).
7. The quote shown before checkout says "Creator receives approximately …", because the Monime fee is an estimate until reported.

### 3.3 Outbound (withdrawals)

- **The payout fee is charged ON TOP.** The recipient gets exactly `amount`; the creator wallet is debited `amount + payoutFee`. This was established in production on 2026-09-15; ib4me's `PAYOUT_FEE_CHARGED_ON_TOP = true`.
- `maxWithdrawable = floor(available × 10000 / (10000 + payoutFeeBps))`, then verified by `amount + fee(amount) ≤ available`.
- The final fee comes from `payout.completed` `data.fees[]`.

### 3.4 Internal ledger (double-entry)

`ledger_entries` mirrors physical balances so we can reconcile against Monime and show creators itemised history.

| Event | Debit | Credit |
|---|---|---|
| Payment settled (arrived) | `platform_cash` | `creator_payable:{creatorId}` (creatorNet) + `platform_revenue` (platformFee) |
| Monime collection fee (memo) | `processor_fees` | `platform_cash` (gross − arrived), memo only |
| Internal transfer completed | `creator_payable:{creatorId}` | `platform_cash` (moves to `creator_wallet:{creatorId}`) |
| Payout completed | `creator_wallet:{creatorId}` | `external` (amount) + `processor_fees` (payout fee) |
| Fee variance (late real fee) | `platform_revenue` | `platform_fee_variance` |

Each entry has a unique `idempotency_key` (`settle:{paymentId}`, `transfer:{paymentId}`, `payout:{payoutId}`, `variance:{spmId}`). The app DB role **cannot UPDATE/DELETE** ledger rows; corrections are new rows.

**Available balance for withdrawal = `min(Monime live balance, ledger creator_wallet balance)`.** It fails **closed**: an unreadable balance refuses the withdrawal. Display may fail **open** with a "may be out of date" label.

---

## 4. Security: threat model & controls

Baseline controls ship in **Phase 0/1**. Each phase's acceptance list includes its security items. Every control has a test (Phase 10 suite).

| Threat | Controls | Where | Test |
|---|---|---|---|
| **CSRF** | (1) Server Actions: Next.js compares `Origin` with `Host` automatically. Leave `experimental.serverActions.allowedOrigins` **unset**: it lists *extra* trusted hosts, and unset means same-origin only. (2) Auth.js routes use its built-in double-submit CSRF token. (3) Cookies are `httpOnly`, `secure`, `SameSite=Lax`, with the `__Secure-`/`__Host-` prefix. (4) Custom state-changing Route Handlers call `assertSameOrigin(req)` (checks `Origin` + `Sec-Fetch-Site: same-origin`), and GET never mutates. (5) Webhook = HMAC; cron = `CRON_SECRET`. These two routes are exempt from the origin check. (6) No mutations during render (no `?logout` GETs). | `server/lib/origin.ts`, `next.config.ts`, `auth.ts` cookie config | Playwright: cross-origin POST to an action/route → 403 |
| **XSS** | React escaping only. **No `dangerouslySetInnerHTML` with user content.** Bios, messages and product descriptions are plain text (or Markdown through a sanitizing allow-list, `rehype-sanitize`). Social links use an `https:` allow-list (rejects `javascript:`/`data:`) with `rel="noopener noreferrer nofollow ugc"`. **Static CSP** sent from `next.config.ts` `headers()`: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: (+ R2 public host when added); font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`. **Not nonce-based:** the Next 16 CSP guide states nonces force every page to render dynamically and are *incompatible with Partial Prerendering*, which would also remove the CDN caching our DDoS posture depends on. The trade-off is `'unsafe-inline'` scripts, so XSS defense rests on React escaping plus the lint ban on `dangerouslySetInnerHTML`. Revisit with experimental SRI (`experimental.sri`) once it is stable. An E2E test asserts no CSP violations on page load. Plus `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, HSTS (`max-age=63072000; includeSubDomains; preload`). Uploaded files are **never served from the app origin**: presigned R2 URLs with `Content-Disposition: attachment` and a fixed `Content-Type`. SVG is rejected for avatars/previews. | `next.config.ts`, `components/*`, `server/validation/*` | Unit: `<script>` and `javascript:` payloads in bio/link/message render inert; E2E: CSP header present |
| **SQL injection / DB attacks** | Drizzle query builder and parameterized `sql\`\`` templates only. **`sql.raw()` is banned** (ESLint `no-restricted-syntax` rule). Zod validates every input with **explicit allow-listed fields** (stops mass assignment of `role`, `status`, `userId`). Repositories scope by owner in the `WHERE` clause (IDOR). **Least-privilege Neon roles**: `app_rw` (DML only, no DDL; **no UPDATE/DELETE on `audit_logs`, `ledger_entries`, `payment_events`, `webhook_events.payload`**) and `migrator` (DDL, used only in CI). DB-level `statement_timeout = 10s` for `app_rw`. Pagination capped (max 100). Public endpoints only hit indexed lookups. Neon PITR enabled, plus a quarterly restore drill. | `server/repositories/*`, migrations, `eslint.config.mjs` | Unit: SQLi strings as handle/search return 404/empty; integration: `app_rw` UPDATE on `ledger_entries` fails |
| **DDoS / abuse** | **Vercel Firewall** WAF rules: rate-limit `/api/*`, `/login`, `/register`, `/*/support` POSTs per IP; **Attack Challenge Mode** runbook. **Vercel BotID** on register, login, checkout start, report forms. **Upstash rate limits** (sliding window) per IP + per email/account + per creator: login 5/15min/email & 20/15min/IP; register 5/h/IP; password reset 3/h/email; checkout start 10/10min/IP & 30/10min/creator; uploads 30/h/user; downloads 20/h/entitlement; provider-KYC lookup 5/h/user (each lookup costs a Monime call). Body limits: `serverActions.bodySizeLimit: '1mb'`; files go **directly to R2** via presigned PUT, never through functions. Public creator/product pages are **cached** (`'use cache'` + `cacheLife('hours')` + `cacheTag`) so spikes hit the CDN, not Neon. Neon **pooled** connection string. Checkout start is idempotent per `(ipHash, creatorId, amount)` within 60s to absorb retry storms. | `server/lib/rate-limit.ts`, Vercel dashboard, `proxy.ts` | Integration: 6th login attempt → 429; k6 smoke load test on public page |
| **Webhook spoofing / replay** | HMAC-SHA256 over `${t}_${rawBody}`, base64, `timingSafeEqual`, ±5min/60s window, unique `provider_event_id` claim, state-machine guards (never move backwards) | Phase 3 | Unit: bad sig → 401; replay → no-op |
| **Account enumeration** | Generic "invalid email or password". Register/forgot-password always respond "if an account exists…". Constant-time Argon2 verify against a dummy hash for unknown emails. | Phase 1 | Unit: timing/response parity |
| **Credential stuffing / brute force** | Rate limits above + BotID + progressive delay; `auth_events` logging; optional lock after N failures (admin unlock) | Phase 1 | Integration |
| **Session theft / revocation** | JWT in an `httpOnly` cookie; `sessionVersion` checked against the DB in the DAL on every protected request; bump on password change, role change, suspension, "sign out everywhere" | Phase 1 | Integration: suspended user's old JWT rejected |
| **Privilege escalation / IDOR** | `requireRole()` server-side on every admin action; ownership in repository `WHERE`; admin routes also checked in services; DTOs only | All | E2E: creator A can't read B's orders; non-admin → 403 on admin actions |
| **Open redirect** | `callbackUrl` / `next` must be same-origin relative paths (allow-list check); Monime success/cancel URLs built server-side from `APP_BASE_URL` | Phase 1/4 | Unit |
| **SSRF** | The server never fetches user-supplied URLs (social links are stored, not fetched). Monime/R2/email hosts are fixed in env. | All | Review |
| **Clickjacking** | `frame-ancestors 'none'` | `proxy.ts` | E2E header check |
| **Malicious uploads** | Extension + declared MIME allow-list, magic-byte sniff after upload (`file-type`), size caps, `scan_status` gate (pending → clean/rejected) before publish, random object keys, no original filenames in keys | Phase 5 | Integration |
| **Secrets exposure** | Secrets only in server env (no `NEXT_PUBLIC_` secrets); `server-only` on all server modules; env validated at boot; logger redaction | Phase 0 | Build fails if a server module is imported client-side |
| **Payout hijack (SIM swap, number change)** | Destination never comes from the request; 48h cooldown on change + notification; provider-KYC re-check on every withdrawal; admin clear on mismatch | Phase 6 | Integration |
| **Supply chain** | Lockfile committed, exact pins for `next`/`next-auth` beta, `npm audit --omit=dev` in CI, Dependabot/Renovate | Phase 0 | CI |

---

## Phase 0 — Foundations

**Goal:** a production-shaped skeleton with DB, env, layering, tokens, testing and the security baseline. No features yet.

### Tasks

1. **Dependencies**
   - Installed in Phase 0 (only what this phase uses): `drizzle-orm`, `@neondatabase/serverless`, `ws`, `zod`, `server-only`, `@upstash/ratelimit`, `@upstash/redis`, `@next/env` (pinned to the Next version). Dev: `drizzle-kit`, `vitest` + `@vitest/coverage-v8` (same version), `@playwright/test`, `tsx`, `@types/ws`, `@types/node@^24` (vitest 5 needs Node ≥ 22 types; Vercel runs Node 24).
   - Installed by the phase that first uses them: `next-auth@5.0.0-beta.x` (exact pin; v5 is still beta on npm) + `@auth/drizzle-adapter` + `@node-rs/argon2` + `botid` (Phase 1); `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` + `sharp` (Phase 2); `file-type` + `pdf-lib` (Phase 5).
2. **`next.config.ts`** (keep existing `cacheComponents`, `partialPrefetching`, `turbopack` rules):
   ```ts
   typedRoutes: true,
   experimental: {
     agentFeedback: true,
     authInterrupts: true,
     serverActions: { bodySizeLimit: '1mb' },   // allowedOrigins unset = same-origin only
   },
   images: { remotePatterns: [{ protocol: 'https', hostname: '<r2-public-preview-host>' }, { protocol: 'https', hostname: 'lh3.googleusercontent.com' }] },
   poweredByHeader: false,
   ```
3. **Env validation:** `server/env.ts` (Zod, `server-only`, parsed lazily at first use; see Appendix A). Add `.env.example`. Add `.env*` to `.gitignore` (except `.env.example`).
4. **DB:** `drizzle.config.ts` (uses `DATABASE_URL_MIGRATOR`), `server/db/client.ts`, a schema folder, and scripts `db:generate`, `db:migrate`, `db:studio`. A Neon branch per preview deployment (Neon ↔ Vercel integration).
5. **Layering scaffolding:** `BaseRepository`, `runInTransaction`, `services/index.ts`, `AppError` hierarchy, `toActionResult`, `toHttpResponse`, logger with redaction.
6. **Security baseline:** static CSP + security headers in `next.config.ts` `headers()` (`proxy.ts` arrives in Phase 1 for auth redirects), `server/lib/origin.ts` (`assertSameOrigin`), `server/lib/rate-limit.ts` (Upstash; in-memory fallback in dev), ESLint rule banning `sql.raw` and `dangerouslySetInnerHTML`.
7. **Instrumentation:** `instrumentation.ts` → `onRequestError` forwards to the error tracker (Sentry `@sentry/nextjs` or Vercel Observability; see Phase 10).
8. **Design system:** `styles/tokens.css` with semantic CSS variables (`--color-primary`, `--color-accent`, `--color-surface`, `--color-border`, `--color-text`, `--color-muted`, `--color-focus`, `--color-success`, `--color-warning`, `--color-danger`) mapped into Tailwind 4 `@theme inline`. **Direction A (coral `#FF7F63` / charcoal `#2E2E2E` / `#F8F1E7`)** is a *temporary* set, swappable in one file. Financial-state colors stay independent of the brand. UI font: pick a performant humanist sans via `next/font` (clear numerals), and keep it separate from logo type.
9. **Clean the scaffold:** replace `app/page.tsx` (it uses deprecated `priority`), set `metadata` with the **DuMeGud** name.
10. **Testing:** `vitest.config.ts`, `playwright.config.ts`, GitHub Actions CI: `typecheck → lint → unit → build → e2e (against preview)`.

### Acceptance
- `npm run build` passes; `eslint` passes; Vitest runs.
- Visiting any page returns CSP + security headers.
- Importing `server/db/client` from a client component fails the build.

---

## Phase 1 — Authentication & accounts

**Goal:** a creator can register (email+password or Google), verify their email, sign in/out, and reset their password. Roles are enforced server-side.

### Schema (`server/db/schema/auth.ts`)

| Table | Key columns |
|---|---|
| `users` | `id`, `email` (unique, lowercased), `emailVerified timestamptz null`, `name`, `image`, `passwordHash text null` (null for Google-only), `role enum('creator','staff','super_admin') default 'creator'`, `status enum('active','restricted','suspended','closed') default 'active'`, `sessionVersion int default 1`, `failedLoginCount`, `lockedUntil`, `createdAt`, `updatedAt` |
| `accounts` | Auth.js adapter shape (`userId`, `type`, `provider`, `providerAccountId`, tokens). Unique `(provider, providerAccountId)` |
| `verification_tokens` | Auth.js adapter shape: `identifier`, `token` (**store SHA-256 hash**), `expires` |
| `password_reset_tokens` | `id`, `userId`, `tokenHash` (unique), `expiresAt`, `usedAt` |
| `auth_events` | `id`, `userId null`, `type` (login_success, login_failed, logout, password_reset_requested, password_changed, email_verified, google_linked), `ipHash`, `userAgent`, `createdAt` (append-only) |

> `sessions` table not needed (JWT strategy). The Drizzle adapter is still used for `users`/`accounts`/`verification_tokens` so Google sign-in creates and links users.

### Auth.js setup

- **`auth.config.ts`** (no DB/argon2 imports, so `proxy.ts` can use it):
  ```ts
  export const authConfig = {
    pages: { signIn: '/login', error: '/login' },
    session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 7, updateAge: 60 * 60 },
    providers: [],   // filled in auth.ts
    callbacks: {
      authorized({ auth, request }) { /* optimistic: /dashboard needs auth, /admin needs staff role claim */ },
    },
  } satisfies NextAuthConfig
  ```
- **`auth.ts`**:
  ```ts
  export const { handlers, auth, signIn, signOut } = NextAuth({
    ...authConfig,
    adapter: DrizzleAdapter(db, { usersTable: users, accountsTable: accounts, verificationTokensTable: verificationTokens }),
    providers: [
      Google({ allowDangerousEmailAccountLinking: false }),
      Credentials({
        credentials: { email: {}, password: {} },
        authorize: async (raw, request) => services.auth.verifyCredentials(raw, request), // returns user | null
      }),
    ],
    callbacks: {
      ...authConfig.callbacks,
      async signIn({ user, account, profile }) { /* Google: require profile.email_verified; block suspended users */ },
      async jwt({ token, user }) { if (user) Object.assign(token, { uid: user.id, role: user.role, sv: user.sessionVersion }); return token },
      async session({ session, token }) { session.user.id = token.uid; session.user.role = token.role; return session },
    },
    events: {
      async createUser({ user }) { after(() => services.wallet.provisionForCreator(user.id)) }, // Google first sign-in
    },
  })
  ```
- **`app/api/auth/[...nextauth]/route.ts`**: `export const { GET, POST } = handlers`.
- **`proxy.ts`** (Next 16 naming):
  ```ts
  import NextAuth from 'next-auth'
  import { authConfig } from './auth.config'
  const { auth } = NextAuth(authConfig)
  export default auth((req) => { /* redirect unauthenticated /dashboard, /admin → /login?next=… */ })
  export const config = { matcher: ['/((?!api/webhooks|api/cron|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'] }
  ```
  > The Auth.js docs still show `export { auth as middleware }`. In Next 16 the file must be `proxy.ts` with a default or `proxy` export. Verify against the installed `next-auth` version when implementing.

### Services

- **`AuthService.register({ email, password, name, handle? })`**
  1. Zod: email normalized and lowercased; password 10–128 chars, checked against a common-password list (top-10k bundle).
  2. Rate limit + BotID check (at the action).
  3. `argon2.hash(password, { algorithm: Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 })` (OWASP baseline; benchmark on Vercel and keep it ≤ ~250ms).
  4. Insert the user in a transaction (unique email → generic response).
  5. `after()`: send the verification email; `services.wallet.provisionForCreator(userId)`.
  6. Respond "Check your email" (same response whether or not the email already exists).
- **`AuthService.verifyCredentials`**: look up the user. If missing, verify against `DUMMY_HASH` (constant time) and return null. If `lockedUntil > now` or status is `suspended`/`closed`, return null. On a successful verify, reset counters and log `auth_events`. On failure, increment the count, add progressive lock, and log. **Unverified emails can sign in**, but publishing, receiving and withdrawing are gated on `emailVerified` (checked in services).
- **`AuthService.verifyEmail(token)`**: hash → look up → check expiry → set `emailVerified` → delete token → `auth_events`.
- **`AuthService.requestPasswordReset(email)`**: always returns ok. If the user exists and has a password, create a 32-byte random token, store its SHA-256 hash with a 30-min TTL, and email the link.
- **`AuthService.resetPassword(token, newPassword)`**: single-use; re-hash; **increment `sessionVersion`** (signs out every device); log the event; send a notification email.
- **`AuthService.changePassword`**, **`signOutEverywhere`**: both bump `sessionVersion`.

### DAL (`server/dal/session.ts`)

```ts
import 'server-only'
import { cache } from 'react'
export const getSession = cache(async () => {
  const s = await auth()
  if (!s?.user?.id) return null
  const u = await repos.users.findAuthState(s.user.id)      // id, role, status, sessionVersion, emailVerified
  if (!u || u.status === 'suspended' || u.status === 'closed' || u.sessionVersion !== s.sv) return null
  return { actor: { userId: u.id, role: u.role, status: u.status, emailVerified: !!u.emailVerified } }
})
export async function verifySession() { const s = await getSession(); if (!s) redirect('/login'); return s }
export async function requireRole(...roles: Role[]) { const s = await verifySession(); if (!roles.includes(s.actor.role)) forbidden(); return s }
```
- Authenticated UI reads the session inside `<Suspense>` boundaries, per the Cache Components auth guide. Layouts **do not** gate; each page/action calls the DAL.
- **Admin step-up:** sensitive admin actions (limits, fees, restrict account, approve KYC, release payout) require password re-entry within the last 10 minutes (`stepUpAt` stored in a short-lived signed cookie). TOTP 2FA for staff comes in Phase 10.

### Email (`server/integrations/email`)

```ts
export interface EmailService { send(msg: { to: string; subject: string; html: string; text: string; tag: string }): Promise<void> }
```
- `EMAIL_ENABLED=false` → `ConsoleEmailService` (logs the redacted recipient + subject + link in dev only).
- `EMAIL_PROVIDER=cloudflare` → `CloudflareEmailService` using the **Cloudflare Email Sending REST API** (`POST https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/email/sending/send`, bearer `CLOUDFLARE_EMAIL_API_TOKEN`, `from: { address, name }`). **Confirm the request shape against the official OpenAPI spec at implementation time**; the service is new. The sending domain must be onboarded (SPF/DKIM/DMARC).
- Templates: plain React-free string templates (or `@react-email/render`) for verify-email, reset-password, password-changed, receipt-contribution, receipt-order, payout-completed/failed, kyc-approved/rejected, payout-method-changed.
- All brand text renders as **DuMeGud**.

### Pages
`(auth)/login`, `register`, `verify-email`, `forgot-password`, `reset-password`. Each is a `<form action>` + `useActionState`, with accessible labels and errors, plus a "Continue with Google" button.

### Acceptance
- Register → verification email (console in dev) → verify → login → dashboard.
- Google sign-in creates the user and kicks off wallet provisioning.
- Suspending a user invalidates their existing JWT on the next request.
- Unknown-email and wrong-password logins return the same message and similar timing.
- A non-staff user hitting `/admin` → 403 page. A direct POST to an admin action → forbidden.

### Implementation notes (as built)
Where the build differs from the plan above:
- **Proxy matcher** is `/dashboard/:path*` and `/admin/:path*` only, not every page: running Auth.js on public pages could add `Set-Cookie` and defeat CDN caching. The proxy never redirects signed-in users away from `/login`: with a revoked JWT that would loop with the DAL's redirect.
- **Login rate limits** (`login:ip`, `login:email`) are enforced in `AuthService.verifyCredentials`, not the action, because `/api/auth/callback/credentials` is reachable directly. They also back a progressive DB lockout: 10 failures → 15 min, doubling, capped at 24 h.
- **Emailed links never act on GET.** `/verify-email` and `/reset-password` show a button or form that POSTs the token, so link scanners can't consume it. Pages set `referrer: no-referrer`.
- **Registration** hashes before checking the email. Both outcomes return the same message; the follow-up email (verification, or "you already have an account") is sent in `after()`. Registration doesn't sign the user in.
- **Password reset** verifies the email (the link proves inbox control). Reset, change password and sign out everywhere all bump `sessionVersion`; change password then sends the user to `/login`.
- **Google:** requires `email_verified`; `linkAccount` marks the user verified and logs `google_linked`. An existing password account with the same email gets `OAuthAccountNotLinked` (no auto-linking). The provider is registered only when `AUTH_GOOGLE_ID`/`SECRET` are set. CSP `form-action` now includes `https://accounts.google.com`, for the no-JS redirect.
- **BotID** (`withBotId` + `instrumentation-client.ts`) protects `/login`, `/register` and `/forgot-password`. `assertNotBot()` is skipped off Vercel and fails open if BotID errors.
- **Common-password list:** the 2,311 entries from SecLists' top-100k that meet the 10-char minimum (the top-10k has only 51).
- **`ALLOW_MEMORY_RATE_LIMIT=true`** lets production builds run without Upstash in CI/E2E. It is refused when `VERCEL_ENV=production`.
- **Not built yet:** admin step-up (Phase 8 with the admin actions), DB-backed integration tests (they need a Neon test branch), and a full register → verify → login E2E against a preview deployment.

---

## Phase 2 — Creator profile, handle & wallet provisioning

**Goal:** every creator has a Monime wallet, a unique handle and a public page they can publish.

### Schema (`server/db/schema/creators.ts`)

| Table | Key columns |
|---|---|
| `creator_profiles` | `id`, `userId` (unique FK), `handle`, `handleLower` (unique), `displayName`, `bio` (≤ 500, plain text), `avatarKey` (R2), `category` FK, `suggestedAmountsMinor int[]` (default e.g. `[2000, 5000, 10000]`, admin-configurable), `supportMessageEnabled bool`, `status enum('draft','published','unpublished','suspended')`, `publishedAt`, `verificationTier enum('none','email','id_verified')`, `riskTier enum('low','medium','high','restricted')`, timestamps |
| `social_links` | `id`, `creatorId`, `platform enum(...)`, `url` (https only), `verifiedAt null`, `position` |
| `categories` | `id`, `slug`, `name`, `active` (admin-managed) |
| `reserved_handles` | `handle` PK (admin, dashboard, api, login, support, p, library, dumegud, monime, …) |
| `creator_wallets` | `id`, `creatorId` (unique FK → users.id), `monimeFinancialAccountId` (unique, null until created), `uvan`, `currency 'SLE'`, `status enum('pending','active','failed','frozen')`, `attempts int`, `lastError text`, `lastAttemptAt`, timestamps |

### Handle rules (`lib/handle.ts`)
- 3–30 chars, `^[a-z0-9](?:[a-z0-9_]{1,28}[a-z0-9])$` (after lowercasing). Not reserved, not taken (case-insensitive). Confusable/offensive deny-list (admin-managed).
- Handle changes: allowed at most once per 30 days. Keep `handle_history` so old links redirect for 90 days.

### `WalletService.provisionForCreator(userId)` (idempotent)

```
1. upsert creator_wallets(creatorId=userId, status='pending') ON CONFLICT DO NOTHING
2. if wallet.status === 'active' → return
3. (outside any transaction) monime.createFinancialAccount(
     { name: `DuMeGud creator ${userId.slice(0,8)}`, currency: 'SLE',
       reference: `creator_${userId}`, description: 'DuMeGud creator wallet',
       metadata: { userId, app: 'dumegud' } },
     idempotencyKey = `creator-wallet-${userId}`)          ← deterministic (ib4me used Date.now(): bug)
4. on success: update wallet set monimeFinancialAccountId, uvan, status='active'
   on failure: attempts++, lastError (Monime code/message only), status='failed' after 5 attempts → admin alert
```
- Triggered by `after()` on registration and by Auth.js `events.createUser` (Google), and retried by `/api/cron/provision-wallets` (Phase 9) for `pending`/`failed` with exponential backoff.
- Don't put PII (email/name) into Monime metadata; the user ID is enough.

### `CreatorService`
- `createOrUpdateProfile(actor, input)`: owner-only.
- `publish(actor)`: requires `emailVerified`, `displayName`, `handle`, accepted creator terms (`creatorTermsAcceptedAt`), wallet `active`, and no active restriction. Otherwise it returns a checklist of unmet items. **The UI never implies payments are enabled before the wallet is active and the profile is published.**
- `unpublish(actor)`, `getPublicProfile(handle)`.

### Public page `app/[handle]/page.tsx`
- `getPublicProfile` is a cached function: `'use cache'`, `cacheLife('hours')`, `cacheTag('creator:'+id)`. Profile edits call `updateTag`.
- Contents: avatar (`next/image`, sized, `fetchPriority="high"` for the hero), name, bio, links, the support widget (Phase 4, client island) and the shop grid (Phase 5). Plus a **Report** link (Phase 7).
- `generateMetadata` (cached) → title, description, OG image (`opengraph-image.tsx` rendering name + avatar + DuMeGud mark).
- `notFound()` for unknown/unpublished/suspended handles. Suspended shows a neutral "unavailable" message.
- Low-bandwidth: no client JS except the support widget island. Images are AVIF/WebP, under 100KB.

### Dashboard shell `(creator)/dashboard`
Overview cards: wallet status, page status checklist, recent support, recent orders, available balance (Phase 6). Mobile-first nav.

### Avatar upload
Presigned PUT to R2 under `avatars/{userId}/{uuid}` with `image/jpeg|png|webp` only, ≤ 2MB. The server re-encodes on confirm to strip EXIF (via `sharp`, available on Vercel) and writes to a separate public-preview bucket/prefix.

### Acceptance
- A new creator's wallet becomes `active` within seconds (or after the cron retry if Monime is down).
- Two simultaneous provisioning calls create exactly one Monime account (same idempotency key + unique column).
- Handle uniqueness is case-insensitive; reserved handles are rejected.
- An unpublished page 404s; a published page is served from cache, and an edit shows immediately for the owner.

### Implementation notes (as built)
Where the build differs from the plan above:
- **Naming:** `creator_wallets.user_id` (→ `users.id`, the money identity used by later phases) and `social_links.profile_id` (→ `creator_profiles.id`), instead of the plan's single `creatorId`. Added `handle_history` (old handle → profile, `released_at`) and `creator_profiles.handle_changed_at` / `creator_terms_accepted_at`.
- **Monime core pulled forward from Phase 3:** `server/integrations/monime/{client,fake,types,index}.ts` with `unwrapResult` (single and double nesting), `MonimeApiError` (nested error parsing, `retryable`), `availableBalanceMinor`, and financial-account create/read only. Phase 3 adds the rest. `MONIME_ENVIRONMENT=fake` is the default and is refused when `VERCEL_ENV=production` (not `NODE_ENV`, so CI can run production builds against the fake).
- **Wallet provisioning** runs from `AuthService.onUserCreated` (registration and Google `createUser`, both in `after()`). Failures are recorded and never thrown; after 5 attempts the wallet is `failed` and an error is logged (the admin alert table arrives in Phase 7). The dashboard offers "Try again"; the Phase 9 cron retries in the background. Rendering never provisions.
- **Handles:** routes are blocked in code (`lib/handle.ts`) as well as by `reserved_handles` (seeded in migration `0002`, with the categories). The first handle is free; later changes start the 30-day cooldown. Casing-only edits don't count. Released handles redirect for 90 days and only their old owner can reclaim them.
- **Public page:** `getCachedPublicProfile` (`server/queries/public-profile.ts`) is `'use cache'` + `cacheLife('hours')`, tagged `handle:{handle}` and `creator:{profileId}`. Actions call `updateTag` on both, so a newly claimed handle drops its cached "not found". Malformed handles are rejected before the cache or DB.
- **Soft 404s:** with Partial Prefetching, `params` must be awaited inside `<Suspense>`, so unknown or unpublished handles render the not-found UI with HTTP 200 + `noindex` (a streamed `notFound()` can't change the status). Old-handle redirects are likewise streamed.
- **Avatars:** the browser PUTs to a private `R2_UPLOADS_BUCKET` under `staging/avatars/{userId}/{uuid}` (content type and length are signed). `confirmAvatarUpload` checks key ownership and the 2 MB cap, re-encodes with sharp to a 400px WebP (EXIF stripped, 25 MP decode limit, JPEG/PNG/WebP only), writes `avatars/{userId}/{uuid}.webp` to the public bucket, and deletes the staging object and the old avatar. Upload is hidden until R2 is configured. CSP `img-src`/`connect-src` gain the R2 origins from env at build time; the S3 client uses path-style URLs so one `connect-src` origin covers every upload. Images use `next/image` with `unoptimized` (already small WebP).
- **Creator terms:** accepted from the dashboard checklist; `/legal/creator-terms` is a draft placeholder until Phase 10.
- **Not built yet:** the OG image (`opengraph-image.tsx`; metadata already sets the avatar as the OG image), the admin-managed offensive-handle deny-list (Phase 8), and admin-configurable suggested amounts (column default for now).

---

## Phase 3 — Monime integration core

**Goal:** one typed, tested Monime client, and one verified, idempotent webhook entry point.

### Client (`server/integrations/monime/client.ts`)

```ts
import 'server-only'
export class MonimeApiError extends Error {
  constructor(public code: string, message: string, public status?: number, public details?: unknown) { super(message) }
  get retryable() { return this.code === 'NETWORK_ERROR' || (this.status ?? 0) >= 500 || this.status === 429 }
}

export function createMonimeClient(cfg: { baseUrl: string; accessToken: string; spaceId: string; version: string }) {
  async function request<T>(method: string, path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${cfg.accessToken}`,
      'Monime-Space-Id': cfg.spaceId,
      'Monime-Version': cfg.version,          // REQUIRED, or version-gated endpoints silently no-op
      'Content-Type': 'application/json',
    }
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
    let res: Response
    try {
      res = await fetch(`${cfg.baseUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15_000) })
    } catch (e) { throw new MonimeApiError('NETWORK_ERROR', String(e)) }
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      const nested = (json as any)?.error
      throw new MonimeApiError(nested?.code ?? (json as any)?.code ?? 'API_ERROR',
        nested?.message ?? (json as any)?.message ?? `HTTP ${res.status}`, res.status, json)
    }
    return unwrapResult(json) as T                    // handles { result } and double-nested { result: { result } }
  }
  return {
    createCheckoutSession: (b: CheckoutSessionRequest, key: string) => request<CheckoutSession>('POST', '/checkout-sessions', b, key),
    getCheckoutSession:    (id: string) => request<CheckoutSession>('GET', `/checkout-sessions/${id}`),
    getPayment:            (id: string) => request<Payment>('GET', `/payments/${id}`),
    createFinancialAccount:(b: FinancialAccountRequest, key: string) => request<FinancialAccount>('POST', '/financial-accounts', b, key),
    getFinancialAccount:   (id: string) => request<FinancialAccount>('GET', `/financial-accounts/${id}?withBalance=true`),
    createInternalTransfer:(b: InternalTransferRequest, key: string) => request<InternalTransfer>('POST', '/internal-transfers', b, key),
    getInternalTransfer:   (id: string) => request<InternalTransfer>('GET', `/internal-transfers/${id}`),
    createPayout:          (b: PayoutRequest, key: string) => request<Payout>('POST', '/payouts', b, key),
    getPayout:             (id: string) => request<Payout>('GET', `/payouts/${id}`),
    getProviderKyc:        (providerId: 'm17' | 'm18', accountId: string) =>
                             request<ProviderKyc>('GET', `/provider-kyc/${providerId}?accountId=${encodeURIComponent(accountId)}`),
  }
}
```
- `unwrapResult` **always** unwraps (ib4me unwrapped inconsistently and shipped a bug in its status route).
- A **`fake.ts`** in-memory implementation (`MONIME_ENVIRONMENT=fake`) for unit/E2E tests. It must emit **realistic `fees[]` arrays, the two-event race and double-nested results**. Otherwise tests can't catch the fee bug class.
- Types live in `types.ts` (Appendix B shapes). All money is `{ currency: 'SLE', value: Minor }`.

### Webhook (`app/api/webhooks/monime/route.ts`)

```ts
export async function POST(request: Request) {
  const raw = await request.text()                                    // raw body BEFORE parsing
  if (!verifyMonimeSignature(raw, request.headers.get('monime-signature'), env.MONIME_WEBHOOK_SECRET))
    return new Response('invalid signature', { status: 401 })
  const evt = parseMonimeEvent(raw)                                   // Zod-validated envelope
  const outcome = await services.webhooks.handleMonime(evt, raw)
  return new Response(null, { status: outcome === 'retry' ? 500 : 200 })
}
```
- **Signature:** header `monime-signature: t=<unix>,v1=<base64>`. Expected = `base64(HMAC_SHA256(secret, `${t}_${raw}`))`. Compare with `timingSafeEqual` on equal-length buffers. Reject if `age > 300s` or `age < -60s`. A missing secret rejects every request.
- **Idempotent claim** (`webhook_events`): `INSERT … ON CONFLICT (provider, provider_event_id) DO NOTHING RETURNING id`. If already `processed` → 200 no-op. If `failed` → re-claim (attempts++) so Monime retries can succeed.
- **Dispatch** (`WebhookService.handleMonime`):

| Event | Handler |
|---|---|
| `checkout_session.completed` | `SettlementService.onCheckoutCompleted` (no fees) |
| `payment.processing_completed`, `payment.completed` (legacy) | `SettlementService.onPaymentCompleted` (has `fees[]`). Resolve the session ID from `data.ownershipGraph.owner` when `type === 'checkout_session'`. |
| `checkout_session.failed` / `.cancelled` / `.expired`, `payment.failed` | `SettlementService.onCheckoutTerminal` (also resolves via `ownershipGraph`, fixing ib4me's bug) |
| `payout.completed`, `payout.failed` | `PayoutService.onPayoutEvent` (look up by `data.id`, fall back to `data.metadata.payoutId`) |
| unknown | record as `ignored`, 200 |

- Returns: success → `processed`/200. Business "not found yet" (a race with an uncommitted row) → `failed`/500 so Monime retries. Permanent (malformed, unknown reference after N attempts) → `failed`/200 + alert.
- Store `payload jsonb` (needed for audit/replay), with phone numbers already masked by Monime.
- **One webhook URL** for every event type, registered in the Monime dashboard on the **final canonical host** (no redirects: a redirected POST is a lost webhook).
- After processing: `revalidateTag('creator-balance:'+creatorId, 'max')`, `revalidateTag('payment:'+paymentId, 'max')` (Route Handler → `revalidateTag`, not `updateTag`).

### Dev webhook simulator
`app/api/dev/monime-webhook/route.ts`: returns 404 unless `MONIME_ENVIRONMENT !== 'live'`. It signs and fires `checkout_session.completed` and `payment.processing_completed` **in either order** with fees, plus payout events.

### Acceptance
- Unit: signature valid/invalid/expired/future/malformed. Double-nested result unwrapping. `MonimeApiError` parses the nested error.
- Replaying the same event 5× → one state change.
- An unknown event → 200 and recorded.

### Implementation notes (as built)
- **Client:** every endpoint in the plan, in `server/integrations/monime/client.ts`. Tolerant readers live in `parse.ts`: `sumMonimeFees` (sums the array, `null` ≠ 0, also accepts the legacy `{ total }`), `resolveCheckoutSessionId` (`ownershipGraph.owner` first) and `describeMonimeFailure` (object/string `failureDetail`). Types are in `types.ts`.
- **Fake = an in-memory Monime *server*** (`FakeMonimeServer`) plugged into the real client as its `fetch`, so unwrapping and error parsing run in every test. It double-nests checkout sessions, returns nested errors, emits a two-entry `fees[]`, produces both settlement events in either order (`completeCheckout(id, { order, fees })`), rejects zero-value transfers, overdrafts, >100-char line-item descriptions, non-string metadata and `+232…` payout numbers, charges payout fees on top (refunded on `payout.failed`), and stubs provider KYC (404 = unregistered). It also honours idempotency keys.
- **Signatures:** `webhook.ts` splits the header on the *first* `=` (ib4me split on every `=` and only worked because decoding ignores missing padding), accepts several `v1` values for secret rotation, and uses a window of 300s old / 60s future. `MONIME_WEBHOOK_SECRET` is required unless fake; the fake uses a built-in dev secret.
- **`webhook_events`** statuses: `processing` → `processed` | `ignored` | `failed` (500, reclaimable) | `dead` (200, never reprocessed; alert). A duplicate arriving while the event is `processing` gets a 500 so a crashed claim can't swallow it. Claims go stale after 10 min (above Vercel's 300s limit) and can then be reclaimed. Handlers must be idempotent anyway.
- **`WebhookService`** takes an event-name → handler map (empty in Phase 3: every event is recorded as `ignored`, logged at warn). Handlers throw `WebhookRetryLater` (row not committed yet; becomes `dead` after 8 attempts) or `WebhookRejected` (permanent). Other exceptions count as transient. Handlers return cache tags; the route revalidates them with `revalidateTag(tag, 'max')`.
- **Route:** 256 KB body cap (413), 401 on any signature failure (before the DB), 400 for a signed but malformed envelope, 500 when the DB is unavailable.
- **Dev simulator** (`/api/dev/monime-webhook`) is available only with `MONIME_ENVIRONMENT=fake` (stricter than "not live"). Actions: `create_checkout`, `complete_checkout` (with `order`, `fees`, `repeat`), `end_checkout`, `settle_payout`, `raw`. It signs each event and POSTs it to the real webhook route.

---

## Phase 4 — One-off support (contributions)

**Goal:** a guest supporter pays a creator through Monime checkout. The creator sees it only after verified settlement, and the net amount lands in the creator's wallet.

### Schema (`server/db/schema/payments.ts`)

| Table | Key columns |
|---|---|
| `payments` | `id`, `kind enum('contribution','order')`, `creatorId`, `status enum('created','pending','succeeded','failed','canceled','expired','reversed','under_review')`, `grossMinor`, `currency`, `monimeFeeMinor null`, `monimeFeeSource enum('reported','estimated') null`, `arrivedMinor null`, `platformFeeBps` (snapshot), `platformFeeMinor null`, `creatorNetMinor null`, `monimeCheckoutSessionId` (unique), `monimePaymentId` (unique, `spm-`), `financialTransactionReference`, `channelReference`, `channelProvider` (m17/m18/card), `payerFingerprintHash`, `ipHash`, `idempotencyKey` (unique), `settledAt`, `settlementFrozen bool`, `transferId` (Monime `tfr-`), `transferStatus enum('none','pending','completed','failed')`, `transferAttempts`, `expiresAt`, timestamps. Indexes: `(creatorId, status, createdAt)`, `(status, createdAt)` |
| `contributions` | `id`, `paymentId` (unique FK), `creatorId`, `supporterName null` (≤ 60), `message null` (≤ 280), `isAnonymous`, `messageVisibility enum('public','creator_only','hidden_by_moderation')`, `createdAt` |
| `payment_events` | `id`, `paymentId`, `fromStatus`, `toStatus`, `source enum('webhook','poll','cron','admin')`, `providerEventId null`, `detail jsonb`, `createdAt` (append-only) |

### Payment state machine (`server/services/payment-state.ts`)

```
created → pending → succeeded → (reversed)
              ↘ failed | canceled | expired
pending → under_review (risk hold) → succeeded | failed
```
- Transitions are applied with `UPDATE … WHERE id = ? AND status = ANY(<allowed from>) RETURNING` (optimistic guard). Each transition writes a `payment_events` row in the same transaction. **Never move backwards** (e.g. a late `expired` after `succeeded` is ignored and logged).

### `ContributionService.start(input, ctx)` (called from the support widget's Server Action)

1. Zod: `{ creatorHandle, amountMinor (int), supporterName?, message?, isAnonymous }`. The amount is ≥ `minContributionMinor` and ≤ `maxContributionMinor` from `platform_settings`.
2. Load the creator: `published`, wallet `active`, no restriction blocking receipts.
3. Rate limit (IP + creator) + BotID.
4. **`LimitService.precheck`** (Phase 7; a no-op stub until then): per-contribution max, creator daily receipts, IP velocity.
5. Compute the quote: `quoteSplit(gross, estimatedMonimeBps, platformFeeBps)`, displayed to the supporter as **"You pay Le X. Creator receives ≈ Le Y after fees."**
6. Insert `payments(status='created', idempotencyKey=uuid)` + `contributions` in **one transaction**.
7. **Outside the transaction:**
   ```ts
   monime.createCheckoutSession({
     name: `Support ${displayName}`.slice(0, 64),
     successUrl: `${APP_BASE_URL}/${handle}/support/success?p=${paymentId}`,
     cancelUrl:  `${APP_BASE_URL}/${handle}/support/cancel?p=${paymentId}`,
     financialAccountId: env.MONIME_PLATFORM_ACCOUNT_ID,          // platform-first
     lineItems: [{ type: 'custom', name: 'Support', quantity: 1,
                   price: { currency: 'SLE', value: grossMinor },
                   description: `Support for @${handle}`.slice(0, 100),   // Monime 100-char limit
                   reference: paymentId }],
     metadata: { paymentId, kind: 'contribution', creatorId },      // string values only, no PII
     callbackState: paymentId,
     paymentOptions: { momo: { disable: false }, card: { disable: !cardEnabled }, bank: { disable: true } },
   }, /* Idempotency-Key */ `checkout-${paymentId}`)
   ```
8. Save `monimeCheckoutSessionId`, `expiresAt`, status → `pending`. Return `redirectUrl`. The client navigates there.
9. On a Monime error: mark the payment `failed` (`lastError`) and show a friendly retry.

### Success / cancel pages
- `/{handle}/support/success?p=…` shows **"Confirming your payment…"** and polls `GET /api/payments/[id]/status` (returns only `{ status }` for that payment ID; IDs are unguessable UUIDv7 + rate-limited). The page shows **Thank you** only when `status === 'succeeded'`. The redirect **never** settles anything.
- The status endpoint may, if still `pending` after ~20s, call `monime.getCheckoutSession` as a fallback. If `completed`, it runs `onCheckoutCompleted` (same idempotent code path, with fee `null` → estimated later).
- `/cancel` marks `canceled` only if still `created/pending` (state guard).

### `SettlementService` (the heart; idempotent and order-independent)

```
onCheckoutCompleted(sessionId):          // no fees
  tx: payment ← lock row (SELECT … FOR UPDATE) by monimeCheckoutSessionId
      if status ∈ {succeeded, reversed}: return
      transition pending → succeeded; settledAt = now; fee fields stay NULL (unknown)
  after tx: ledger 'settle' deferred until fee known (or cron estimate), RiskService.evaluate, notify creator

onPaymentCompleted(data):                 // has fees[]
  sessionId = data.ownershipGraph.owner.id (type checkout_session)
  feeMinor  = sumFees(data.fees)          // null if absent
  tx: payment ← lock
      record monimePaymentId (spm-), financialTransactionReference, channel.reference, channel.provider,
             payerFingerprintHash = sha256(PEPPER + data.channel.fingerprint ?? data.channel.phoneNumber)
      if status not succeeded → transition to succeeded
      if monimeFeeMinor IS NULL and feeMinor != null:
          compute split (arrived, platformFee, creatorNet), feeSource='reported'
          ledger: settle:{paymentId}  (createIdempotent)
      elif already set and differs and settlementFrozen:
          ledger: variance:{spm-id}   (platform absorbs the difference; never re-transfer)
  after tx: TransferService.settleToCreator(paymentId)

onCheckoutTerminal(sessionId, status):    // failed/cancelled/expired
  guarded transition from created|pending only
```

### `TransferService.settleToCreator(paymentId)`
1. Preconditions: payment `succeeded`, split computed (`creatorNetMinor` not null), `transferStatus ∈ {none, failed}`, creator wallet `active`, creator not `frozen`.
2. If `creatorNetMinor ≤ 0` → mark transfer `completed` (nothing to move), freeze.
3. Mark `transferStatus='pending'` (guarded), commit.
4. `monime.createInternalTransfer({ amount: { currency: 'SLE', value: creatorNetMinor }, sourceFinancialAccount: { id: PLATFORM }, destinationFinancialAccount: { id: wallet.monimeFinancialAccountId }, description: 'DuMeGud support payout', metadata: { paymentId, type: 'creator_settlement' } }, `transfer-${paymentId}`)`.
5. Poll `getInternalTransfer` briefly (≤ 3 × 1s). `completed` → tx: `transferStatus='completed'`, `settlementFrozen=true`, ledger `transfer:{paymentId}`. `failed` → `transferStatus='failed'`, attempts++. Still pending → leave it for the `retry-transfers` cron (it will `getInternalTransfer` by the stored ID first, never re-create with a new key).
6. **Fee-unknown timeout:** if `payment.processing_completed` never arrives within 15 min, the cron uses the estimated fee (`feeSource='estimated'`), logs a warning, and proceeds. A late reported fee becomes a variance.

### Creator views
- Dashboard "Supporters": succeeded contributions only, with name/"Anonymous", message (moderation-aware), gross, platform fee, Monime fee (with an "est." tag when estimated), and net. Pending ones are listed separately as "Processing".
- Public page: optional "Recent supporters" list showing **only succeeded + public + non-anonymous** names and messages.

### Acceptance
- E2E with fake Monime: support → pending page → webhook pair (both orders) → success page → creator sees net = gross − fee − platformFee → ledger balanced → transfer completed once.
- Replaying either webhook is a no-op. The fee is never overwritten with 0.
- A cancel/expire after success is ignored.
- Hitting the success URL without a webhook never shows "Thank you" unless the Monime poll says `completed`.

### Implementation notes (as built)
- **Pulled forward:** `ledger_journals` + `ledger_entries` (planned for Phase 6) and a minimal `platform_settings` table (Phase 7/8) with `PlatformSettingsService`. Seeded by migration `0005` with **placeholder** values: contribution fee 300 bps and product fee 500 bps (the PRD §9 hypotheses), Monime estimate 100 bps, min Le 10, max Le 500 (PRD: not approved). Invalid or missing values fall back to defaults and are logged. The admin editor and history table arrive in Phase 8.
- **Ledger model:** a journal holds balanced lines (debit +, credit −), with keys `settle:{paymentId}`, `transfer:{paymentId}` and `variance:{spm}`. Accounts: `platform_cash` (mirrors the platform Monime account), `creator_wallet:{userId}` (mirrors the creator's Monime account; Phase 6's withdrawal gate), `creator_payable:{userId}` (owed to the creator until payout), `platform_revenue`, `platform_fee_variance`. Transfer = Dr `creator_wallet`, Cr `platform_cash`. The Monime fee lives on the payment row, not in a memo journal. This replaces the looser table in §3.4.
- **Transfer idempotency key** is `transfer-{paymentId}-{definitiveFailures}`, not `transfer-{paymentId}`: replaying a key Monime definitively failed only returns that failure. Network errors and 5xx keep the key (a request that went through is replayed, not duplicated). `TransferService.refreshPending` is the Phase 9 cron entry point.
- **Settlement:** both events lock the row (`FOR UPDATE`) and are order-independent. The split is computed once from the first known fee; a reported fee that differs from an earlier estimate always becomes a variance (the creator keeps their split, even before the transfer froze it). Money arriving for a `failed`/`canceled`/`expired` payment, or with a different amount, goes to `under_review`, never straight to `succeeded`. A webhook that arrives before the checkout id is saved is matched via `metadata.paymentId`. `settleWithEstimate` is the Phase 9 fee-timeout entry point.
- **Cancel page changes nothing** (anyone can open the URL); Monime's `checkout_session.cancelled`/`.expired` webhooks do. The success page polls `/api/payments/[id]/status` (rate-limited `payment-status:ip`, UUID-checked, `{ status }` only). After 20s pending, the endpoint asks Monime and applies the same idempotent settlement: the one GET that writes.
- **Messages are creator-only** (`messageVisibility = 'creator_only'`) until moderation exists (Phase 7). The public "recent supporters" list shows non-anonymous names only. Anonymous supporters' names are not stored.
- **Checkout dedupe:** same IP hash + creator + amount within 60s reuses the open checkout URL. Card and bank are disabled; mobile money only.
- **CSP:** `form-action` allows `https://*.monime.io` for the no-JS redirect to checkout. **Confirm the hosted-checkout host against a live session.** BotID protects POSTs on `/*` (the widget action posts to `/{handle}`).
- **Tests on real SQL:** `tests/integration` runs every migration on PGlite (in-process Postgres) and drives the real repositories, webhook pipeline and fake Monime through the acceptance list (both event orders, replays, concurrent delivery, estimate + variance, late cancel, late success, poll fallback, amount mismatch).
- **Not built yet:** `LimitService.precheck` / `RiskService.evaluate` (Phase 7), the creator "new support" email, supporter receipts (guests give no email), and the `retry-transfers` / fee-estimate crons (Phase 9; their service entry points exist).

---

## Phase 5 — Digital products & secure delivery

**Goal:** creators sell downloadable files. Buyers pay as guests, get a buyer-specific entitlement, and download through short-lived signed URLs.

### Schema (`server/db/schema/products.ts`)

| Table | Key columns |
|---|---|
| `products` | `id`, `creatorId`, `title` (≤ 120), `slug`, `description` (≤ 5000, plain/sanitized md), `categoryId`, `priceMinor`, `currency`, `licenseType enum('personal','personal_modify','commercial')`, `licenseText`, `downloadLimit int` (default from settings, e.g. 5), `accessDays int` (e.g. 30), `status enum('draft','pending_review','published','unpublished','suspended')`, `ownershipDeclaredAt`, timestamps |
| `product_assets` | `id`, `productId`, `kind enum('file','preview_image','preview_audio')`, `r2Key` (random), `originalFilename` (display only), `mimeType`, `sizeBytes`, `sha256`, `scanStatus enum('pending','clean','rejected')`, `scanDetail`, `watermarkable bool`, `createdAt` |
| `orders` | `id`, `paymentId` (unique FK), `productId`, `creatorId`, `buyerEmail` (for receipt/recovery; encrypted at rest, see below), `buyerEmailHash` (lookup), `buyerName null`, `priceMinor`, `status` (mirrors payment), `accessToken` hash (library link), timestamps |
| `entitlements` | `id`, `orderId` (**unique** → one entitlement per order), `productId`, `downloadsUsed`, `downloadLimit`, `expiresAt`, `revokedAt null`, `revokedReason` |
| `download_events` | `id`, `entitlementId`, `assetId`, `ipHash`, `userAgent`, `createdAt` (append-only) |

> **Field encryption:** `buyerEmail` and KYC fields use app-level AES-256-GCM (`server/lib/crypto.ts`, key `FIELD_ENCRYPTION_KEY`, versioned for rotation), with an HMAC hash column for lookups.

### Upload flow (direct to R2, never through functions)
1. `POST /api/uploads/presign` (session + `assertSameOrigin` + rate limit) takes `{ productId, kind, filename, mimeType, sizeBytes }`.
   - Validate the extension/MIME allow-list from `platform_settings` (MVP: `pdf, epub, mp3, wav, zip, png, jpg, webp, psd?`, decided in Phase 0 feasibility) and size ≤ `maxUploadBytes` (e.g. 200MB).
   - Generate key `products/{creatorId}/{productId}/{uuid}` and insert `product_assets(scanStatus='pending')`.
   - Return a presigned **PUT** (10-min TTL, `ContentType` + `ContentLength` bound into the signature).
2. The client uploads to R2 and calls the `confirmUpload(assetId)` action.
3. `confirmUpload`: `HeadObject` (size matches), ranged GET of the first 4KB → `file-type` magic-byte sniff must match the declared type, and record `sha256` (streamed, in `after()` or the cron for large files).
4. **Malware scan:** `ScanService` interface. MVP implementation = **manual admin review queue** + magic-byte checks (no vendor yet; Appendix F). A product cannot be `published` until every asset is `clean`.
5. R2 CORS: allow PUT only from the app origin.

### Product lifecycle
`draft → (submit) pending_review → published` (auto-publish allowed for `id_verified` low-risk creators via a setting) `→ unpublished`. `suspended` comes only from admin moderation. Publishing requires the ownership/licence declaration checkbox (timestamped).

### Purchase flow
Reuses the Phase 4 pipeline with `kind='order'`:
- The product page `p/[productId]` (cached; tag `product:{id}`) shows title, description, preview, format, size, price, license terms, download limit and access period **before** purchase.
- The `PurchaseService.start` action collects buyer email (required, for receipt/recovery) + optional name → `payments(kind='order')` + `orders` → checkout session (metadata `{ paymentId, kind: 'order', creatorId, productId }`).
- **In the `SettlementService` succeeded transition (same transaction):** `INSERT entitlements … ON CONFLICT (orderId) DO NOTHING` → exactly one entitlement, even across replays. Then `after()`: send a receipt email with the **library link** `/library/{accessToken}` (32-byte random; store only the hash).
- Platform fee uses `productPlatformFeeBps`.

### Download flow
- `/library/[accessToken]` lists entitlements for that order, showing downloads remaining and the expiry.
- `GET /api/downloads/[token]`. The token is a short-lived signed value: HMAC(`DOWNLOAD_SIGNING_SECRET`, entitlementId|assetId|exp), 60s.
  1. Verify the HMAC + expiry.
  2. Load the entitlement: not revoked, not expired, `downloadsUsed < downloadLimit`, payment still `succeeded`.
  3. Atomically `UPDATE entitlements SET downloadsUsed = downloadsUsed + 1 WHERE id=? AND downloadsUsed < downloadLimit`.
  4. Insert `download_events`.
  5. 302 to a presigned R2 **GET** (TTL 5 min, `ResponseContentDisposition: attachment; filename="<safe>"`).
- **PDF watermarking** (when `watermarkable`): on first download, `pdf-lib` stamps a footer `Licensed to order #{shortOrderRef} · DuMeGud` (no email/name, per the PRD privacy note), stores it as a derived object `watermarked/{orderId}/{assetId}.pdf`, and serves that. Disclose this on the product page.
- **Recovery:** "Lost your link?" form → enter email → if orders exist for that `buyerEmailHash`, email the library links (rate-limited, generic response).

### Acceptance
- A private R2 object URL fetched directly → 403.
- An expired download token → 403. The (limit+1)th download → a friendly limit message.
- Webhook replay → still one entitlement, one receipt.
- An uploaded `.pdf` that is actually an executable → rejected.

### Implementation notes (as built)
- **Uploads use Server Actions** (`requestProductUpload` / `confirmProductUpload`) instead of `POST /api/uploads/presign`: same checks (session, upload rate limit, allow-list and size from `platform_settings`, presigned PUT bound to type and exact length, 10-min TTL), with Next's built-in origin check instead of `assertSameOrigin`. Assets start as `uploading`. On confirm: `HeadObject` size must match, a 4 KB ranged GET must sniff as the declared type (`server/lib/uploads.ts`; a renamed `.exe` is rejected and deleted), then `pending` (awaiting review). SHA-256 is streamed in `after()`.
- **Preview images** (no preview audio yet) go to the private uploads bucket, are re-encoded with sharp (≤1200px WebP, metadata stripped) into the public bucket, and are `clean` immediately.
- **Review = scan for the MVP:** staff approve or send back from `/admin/products` (`ProductReviewService`, pulled forward from Phase 8; no audit log yet). Approving marks pending files clean and publishes. Editing a live product, or adding a file to it, sends it back to `pending_review`. Files are locked once a product has ever been published (buyers rely on them). Auto-publish for verified creators is not built (needs Phase 6 KYC).
- **Orders:** `orders.status` isn't stored; it comes from the payment. The buyer email is AES-256-GCM encrypted (`encryptField`, `FIELD_ENCRYPTION_KEY`, plus a `_PREVIOUS` key for rotation) with a peppered hash for lookup. The library token is stored as a SHA-256 (lookup) plus an encrypted copy, so recovery re-sends the same link.
- **Instant access:** the purchase action sets an httpOnly `dmg_claim` cookie (`paymentId.secret`; the order stores the secret's hash). The status endpoint returns `libraryUrl` only to that browser once the payment succeeded. Anyone else with the success URL sees "check your email".
- **Fulfilment hook:** `SettlementService` takes `fulfilment[kind]`. For orders, `onSucceeded` grants the entitlement in the same transaction as the succeeded transition (unique `orderId` → exactly one). `afterSucceeded` sends the receipt once (claimed via `orders.receipt_sent_at`, released if sending fails). **Phase 8: any admin `under_review → succeeded` resolution must call the same fulfilment.**
- **Downloads:** the library form → `downloadFile` action mints a 60s HMAC token → `/api/downloads/[token]` re-checks everything, increments atomically (`downloads_used < download_limit AND not revoked AND not expired`), logs `download_events`, then 302s to a 5-min presigned GET with `Content-Disposition: attachment`. Failures redirect to `/library?download=…`. PDFs ≤ 50 MB are stamped once per order (`watermarked/{orderId}/{assetId}.pdf`, "Licensed to order #XXXXXXXX - DuMeGud"); anything that can't be stamped is served as is. CSP `form-action` includes the R2 origin for the no-JS redirect.
- **Settings added** (migration `0007`, placeholders): product price Le 5 to Le 5,000, uploads ≤ 200 MB with types `pdf, epub, mp3, wav, zip, png, jpg, webp`, 5 downloads over 30 days. Product fee 500 bps.
- **R2 setup:** bucket `R2_PRODUCTS_BUCKET` (private, CORS PUT from the app origin); previews use `R2_UPLOADS_BUCKET` (staging) and `R2_PUBLIC_BUCKET`.

---

## Phase 6 — Wallet, KYC, payout methods & withdrawals

**Goal:** creators see their balance, pass manual KYC, bind a verified mobile money number, and withdraw to it safely.

### Schema (`server/db/schema/wallet.ts`)

| Table | Key columns |
|---|---|
| `kyc_submissions` | `id`, `userId`, `legalName` (encrypted), `dateOfBirth` (encrypted), `idType enum('national_id','passport','drivers_license','voter_id')`, `idNumberHash` (HMAC w/ pepper, **unique among approved**: one document = one account), `idFrontKey`, `idBackKey null`, `selfieKey`, `status enum('pending','approved','rejected','needs_more_info')`, `reviewerId`, `reviewNotes`, `reviewedAt`, `rejectionReasonCode`, timestamps |
| `payout_methods` | `id`, `userId` (one active), `type 'momo'`, `providerId enum('m17','m18')`, `msisdn` (`232XXXXXXXX`, encrypted) + `msisdnHash`, `holderName`, `nameMatch enum('match','partial','mismatch','unavailable')`, `status enum('cooling_off','active','needs_recheck','disabled')`, `cooldownUntil`, `boundAt`, `verifiedAt` |
| `payouts` | `id`, `creatorId`, `payoutMethodId`, `amountMinor`, `quotedFeeMinor`, `feeMinor null`, `feeSource`, `totalDebitMinor`, `currency`, `status enum('requested','in_review','processing','completed','failed','canceled')`, `reviewReason null`, `monimePayoutId` (unique), `idempotencyKey` (unique, `payout-{id}`), `failureCode`, `failureMessage`, `completionApplied bool`, `destinationSnapshot jsonb` (masked), `holderNameAtRequest`, `requestedAt`, `completedAt`. **Partial unique index: one open payout per creator** (`status IN ('requested','in_review','processing')`) |
| `ledger_entries` | `id`, `account text` (e.g. `creator_wallet:{uuid}`), `direction enum('debit','credit')`, `amountMinor > 0` (CHECK), `currency`, `refType`, `refId`, `idempotencyKey` (unique), `createdAt` |

### KYC (manual)
- The creator uploads ID front/back + a selfie holding the ID: presigned PUT to the **separate private bucket** `R2_KYC_BUCKET`, images only, ≤ 8MB, EXIF stripped on confirm.
- Admin review queue (Phase 8): view via 2-min presigned GET (every view audit-logged), compare legal name/photo, then approve/reject/need-info with a reason code.
- On approval: `creator_profiles.verificationTier='id_verified'`, the legal name is stored (encrypted) for name matching, and an email is sent.
- Retention: documents deleted N days after account closure (setting); the decision record is kept.

### Binding a payout method — `PayoutMethodService.bindMobileMoney(actor, { phone })`
1. Requires KYC `approved`. Rate limit 5/h.
2. `lib/phone.ts`: normalize → `232XXXXXXXX`. Detect the operator from the prefix map (**Orange → `m17`**, **Africell/AfriMoney → `m18`**; the prefix table lives in `platform_settings` so it can be updated without a deploy). The user can override the operator.
3. `monime.getProviderKyc(providerId, msisdn)` → `holderName`. A 404 → "This number isn't registered for mobile money."
4. `nameMatch(holderName, kycLegalName)` (token-based, accent/case-insensitive, initials-tolerant). On `mismatch` → status `needs_recheck` → admin review. Enforcement is a setting (start enforced; ib4me started in shadow mode).
5. If this replaces an existing method → **48h `cooling_off`**, notification email, audit log. The first binding is also cooling-off for 24h (setting).
6. Cron/lazy promotion `cooling_off → active` when `cooldownUntil < now`.

### Balance — `WalletService.getBalance(actor)`
- `ledger = sum(creator_wallet:{id})`; `live = monime.getFinancialAccount(id).balance.available.value` (handle `number | {value} | null`).
- Display: `available = min(live, ledger)`, `maxWithdrawable = maxWithdrawableMinor(available, payoutFeeBps)`, plus pending (succeeded-not-yet-transferred) totals. If `live` is unreadable → show the ledger figure with an "updating" label.
- Cached per request only (no `'use cache'` on balances).

### Withdrawal — `PayoutService.request(actor, { amountMinor })`
Checks, in order (each a typed error with a creator-friendly message):
1. Global withdrawals kill-switch off; user `active`; email verified; KYC `approved`; no restriction on payouts.
2. Payout method `active` (not cooling_off/needs_recheck).
3. `amount ≥ minPayoutMinor` (setting) and limits (Phase 7: daily/30-day payout caps by tier).
4. **Live re-check:** `getProviderKyc` again; a holder-name change → method `needs_recheck`, refuse (SIM-swap / recycled-number guard).
5. Balance: `available = min(live, ledger)` **fail closed**; `amount + quotedFee ≤ available`.
6. tx: insert `payouts(status='requested' | 'in_review')` (the partial unique index enforces one open payout). Above `autoApproveMaxMinor` or high risk tier → `in_review` (stop here; admin releases later).
7. Outside the tx: `monime.createPayout({ destination: { type: 'momo', providerId, phoneNumber: msisdn }, amount: { value: amountMinor, currency: 'SLE' }, source: { financialAccountId: wallet.monimeFinancialAccountId }, metadata: { payoutId, creatorId } }, `payout-${payoutId}`)` → store `monimePayoutId`, status `processing` (or apply completion immediately if the response is `completed`).
8. Monime error → `failed` with `failureCode/message` (no auto-retry; the creator can re-request).

### Completion — `PayoutService.onPayoutEvent` (webhook) / reconciliation cron
- Find by `data.id` → fallback `metadata.payoutId`. Ignore unknown statuses. Never move from `completed`.
- `completed`: tx with a guard `completionApplied=false` → set `feeMinor = sumFees(data.fees) ?? estimate` (`feeSource`), `totalDebitMinor`, ledger `payout:{id}` (debit wallet by amount + fee), `completionApplied=true`. Send a "payout sent" email.
- `failed`: `failureDetail` is an **object** `{ code, message }`. Store both fields separately. Notify the creator.

### Pages
`dashboard/wallet` (balance breakdown, history from the ledger, withdraw form with a live fee/net quote), `dashboard/verification` (KYC upload + status), `dashboard/payout-method` (bind/change, cooldown banner).

### Acceptance
- Can't withdraw without KYC + an active method; can't exceed `maxWithdrawable`; can't open two payouts.
- Webhook completion applied once, even when the webhook and the cron race.
- Changing the number → 48h block + email.
- A holder-name change at withdrawal → refused + flagged.

---

## Phase 7 — Risk, limits & compliance

**Goal:** the PRD §6 controls. Every threshold is configurable in admin, nothing is hardcoded, and every change is audited.

### Schema (`server/db/schema/risk.ts`, `admin.ts`)

| Table | Purpose |
|---|---|
| `platform_settings` | Versioned key/value (`key`, `value jsonb`, `version`, `updatedBy`, `updatedAt`) + `platform_settings_history`. Keys: `fees.contributionBps`, `fees.productBps`, `fees.monimeCollectionBpsEstimate`, `fees.monimePayoutBpsEstimate`, `amounts.minContribution`, `amounts.maxContribution`, `amounts.suggestedDefault`, `payouts.min`, `payouts.autoApproveMax`, `payouts.killSwitch`, `uploads.allowedTypes`, `uploads.maxBytes`, `downloads.defaultLimit`, `downloads.accessDays`, `phone.operatorPrefixes`, `kyc.nameMatchEnforced`, `features.*` |
| `transaction_limits` | `id`, `scope enum('per_contribution','supporter_to_creator','supporter_global','creator_receipts','creator_payouts','velocity_count')`, `window enum('single','24h','7d','30d')`, `verificationTier null`, `riskTier null`, `rail null`, `maxAmountMinor null`, `maxCount null`, `action enum('block','review','flag')`, `active`, `updatedBy` |
| `limit_counters` | Not a table of truth: computed with indexed `SUM/COUNT` over `payments` within the window (`(creatorId, settledAt)`, `(payerFingerprintHash, settledAt)`, `(ipHash, createdAt)` indexes). Hot paths may use Upstash counters as a cache. |
| `risk_rules` | `id`, `code` (e.g. `RAPID_REPEAT`, `JUST_BELOW_THRESHOLD`, `SAME_PAYER_CONCENTRATION`, `NEW_CREATOR_SPIKE`, `PAYOUT_DETAIL_CHURN`, `FAILURE_SPIKE`, `SELF_FUNDING`), `params jsonb`, `severity`, `active` |
| `risk_alerts` | `id`, `ruleCode`, `subjectType enum('creator','payment','payout','product')`, `subjectId`, `severity`, `evidence jsonb`, `status enum('open','dismissed','escalated','actioned')`, `caseId null`, `createdAt` |
| `risk_cases` | `id`, `creatorId`, `reasonCodes text[]`, `assigneeId`, `status enum('open','info_requested','escalated','closed')`, `decision enum('dismiss','request_info','restrict','pause_feature','escalate','restore') null`, `decisionNotes`, `approvals jsonb` (dual approval), timestamps |
| `account_restrictions` | `id`, `userId`, `feature enum('receive','withdraw','publish','upload','all')`, `reason`, `caseId`, `createdBy`, `expiresAt null`, `liftedAt null`, `liftedBy` |
| `content_reports` | `id`, `targetType enum('creator','product')`, `targetId`, `reason enum('scam','impersonation','copyright','illegal','other')`, `details`, `reporterEmailHash null`, `ipHash`, `status`, `createdAt` |
| `moderation_actions` | `id`, `targetType`, `targetId`, `action`, `reason`, `actorId`, `createdAt` |
| `audit_logs` | `id`, `actorId null`, `actorRole`, `action`, `targetType`, `targetId`, `before jsonb`, `after jsonb`, `ipHash`, `requestId`, `createdAt`. **Append-only**: no UPDATE/DELETE grant to `app_rw` + trigger `RAISE EXCEPTION` on UPDATE/DELETE. |

### Services
- **`LimitService.precheck({ creatorId, amountMinor, ipHash, verificationTier, riskTier })`** runs before checkout (the payer fingerprint isn't known until the webhook). It finds the applicable limits by `(scope, window, tier)`, computes `SUM/COUNT`, and returns `allow | block(reasonCode) | review`. A block shows the supporter a neutral message ("This creator can't receive this amount right now").
- **`LimitService.postcheck(payment)`** runs after settlement with the real `payerFingerprintHash` (supporter→creator and supporter-global windows). A breach → payment `under_review` **before the internal transfer**, so funds stay in the platform account until reviewed. An alert is raised.
- **`RiskService.evaluate(event)`** runs via `after()` on settlement, payout request, payout-method change and product publish. It runs the active rules and creates `risk_alerts` (signals, not allegations). It can raise `riskTier` but **never auto-restricts**; restrictions are human decisions (except hard limits configured as `block`).
- **`CaseService`**: create from alerts, assign, add notes, decide. `restrict`/`restore` writes `account_restrictions`. Sensitive decisions (restrict a creator with a balance above X, override a limit, release a held payout above X) need **dual approval** (a second staff member).
- **`AuditService.log(actor, action, target, before, after)`** is called by every admin/staff mutation and by security-relevant creator actions (payout method change, payout request, handle change).
- **`ReportService`**: a public report form on creator and product pages (BotID + rate limit) → `content_reports` → moderation queue.

### Acceptance
- Admin changes `per_contribution` max → takes effect immediately (no deploy), with an audit entry including before/after.
- 10 rapid contributions from one fingerprint → an alert. Breaching the supporter→creator 24h limit → payment `under_review`, no transfer.
- An `app_rw` attempt to UPDATE `audit_logs` → error.

---

## Phase 8 — Admin dashboard

**Goal:** the PRD §8 modules. Every action is enforced server-side.

Route group `(admin)/admin`. `requireRole('staff','super_admin')` in every page and action. `super_admin`-only: fees, limits, roles, kill-switch, dual-approval second signatures for super-sensitive actions. Step-up re-auth for sensitive actions (Phase 1).

| Module | Pages / actions |
|---|---|
| Overview | Registrations, active/published creators, GTV (gross), platform revenue, pending transfers, payouts in review, open alerts/reports, webhook failure count, ledger-drift status |
| Creators | Search (handle/ID/email-hash), view profile + wallet + KYC + payout method (masked) + history, change status, request info, restrict/restore (→ case) |
| KYC queue | Pending submissions, view documents (presigned, audit-logged), approve/reject/need-info |
| Products & reports | Moderation queue (pending_review, reported), approve/suspend/takedown, asset scan approval |
| Transactions | Filter payments by status/kind/creator/date. Detail shows Monime IDs, event timeline (`payment_events`), ledger entries, transfer status. Actions: retry transfer, re-sync from Monime (`getCheckoutSession`), mark reviewed |
| Payouts | `in_review` queue, release/reject (dual approval above threshold), stuck `processing` list with re-sync |
| Risk | Alerts list → open case; cases with notes, decisions and approvals; rules editor (params, active) |
| Limits & settings | `transaction_limits` CRUD; `platform_settings` editor (fees, amounts, uploads, operator prefixes, kill-switch) with version history |
| Audit & ops | Audit log viewer (filter, export CSV for super_admin, export itself audited), webhook events (status, attempts, replay button for `failed`), cron run history |

Platform account IDs come from env; the admin page shows them read-only plus the live platform balance.

### Acceptance
- A non-staff POST to any admin action → `forbidden()`.
- Every mutation produces an `audit_logs` row.

---

## Phase 9 — Background jobs & reconciliation

**Goal:** money never gets stuck silently. Vercel Cron → Route Handlers.

`vercel.ts`:
```ts
import type { VercelConfig } from '@vercel/config/v1'
export const config: VercelConfig = {
  framework: 'nextjs',
  crons: [
    { path: '/api/cron/provision-wallets',  schedule: '*/5 * * * *' },
    { path: '/api/cron/retry-transfers',    schedule: '*/5 * * * *' },
    { path: '/api/cron/reconcile-payments', schedule: '*/10 * * * *' },
    { path: '/api/cron/reconcile-payouts',  schedule: '*/10 * * * *' },
    { path: '/api/cron/ledger-drift',       schedule: '0 * * * *' },
    { path: '/api/cron/cleanup',            schedule: '30 3 * * *' },
  ],
}
```

Each cron route:
```ts
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) return new Response(null, { status: 401 })
  return services.jobs.run('reconcile-payments', () => services.reconciliation.payments({ batch: 50 }))
}
```
- `JobService.run` takes an advisory lock (`pg_try_advisory_lock(hashtext(name))`) so overlapping runs skip, records `job_runs` (name, startedAt, finishedAt, processed, errors), and bounds the batch size to stay within the function duration.

| Job | Does |
|---|---|
| `provision-wallets` | Wallets `pending/failed` with attempts < 10 → `provisionForCreator` (backoff by `lastAttemptAt`) |
| `retry-transfers` | Payments `succeeded` with transfer `none/failed/pending` older than 2 min → if `transferId` exists `getInternalTransfer` first, else `settleToCreator`. Applies the fee-estimate fallback after 15 min |
| `reconcile-payments` | Payments `pending` older than 15 min → `getCheckoutSession` → advance through the same `SettlementService` paths. Older than the session expiry → `expired` |
| `reconcile-payouts` | Payouts `processing` older than 10 min → `getPayout` → `onPayoutEvent` path |
| `ledger-drift` | Per creator wallet (active, changed in the last 24h) + platform: compare the ledger vs the Monime live balance. Drift > tolerance → `risk_alerts(type='LEDGER_DRIFT')` + ops alert |
| `cleanup` | Promote `cooling_off` payout methods, expire stale tokens, purge expired verification/reset tokens, retention deletions (KYC docs per policy), mark expired entitlements |

### Acceptance
- Killing the webhook (simulated) → the payment still settles via `reconcile-payments` within 15 min.
- Overlapping cron invocations don't double-process.

---

## Phase 10 — Hardening, observability & pilot launch

### Observability
- Error tracking via `instrumentation.ts` `onRequestError` (Sentry `@sentry/nextjs` or Vercel Observability; pick in Phase 0) with PII scrubbing.
- Structured logs with `requestId`.
- Alerts:
  - webhook failures > N/10min
  - `job_runs` errors or a missing run
  - ledger drift
  - transfers stuck > 30 min
  - payouts `processing` > 1h
  - provisioning failures
  - checkout failure rate spike
  - unusual volume (sum per hour > threshold)
- Metrics (PRD §15) as admin overview queries: onboarding completion, activated creators, visit→contribution conversion (Vercel Analytics events), checkout success/failure/pending rates, time from payment to entitlement.

### Security hardening
- Re-run the §4 checklist.
- Pen-test the auth, checkout, download and admin flows.
- TOTP 2FA for staff/super_admin (custom: `otplib`, secrets encrypted).
- Staff access review procedure.
- Secrets rotation runbook (Monime token, webhook secret, `AUTH_SECRET`, field encryption key versions).
- Vercel Firewall rules + BotID enabled in production.
- Dependency audit.

### Reliability
- Neon PITR + a documented restore drill.
- An incident response runbook (payment provider outage → show "payments temporarily unavailable" via a feature flag; kill-switch for withdrawals).

### Test suite (map to PRD §13 in Appendix E)
- **Unit:**
  - money/fees (floor per payment, `null` vs 0, `maxWithdrawable`)
  - signature verification
  - `unwrapResult`
  - state machines
  - handle rules, phone normalization, name matching
  - CSP header builder, origin check
- **Integration** (Neon branch + fake Monime):
  - settlement in both event orders + replays
  - transfer retries
  - payout completion race (webhook vs cron)
  - limits/review hold
  - `app_rw` privilege restrictions
  - rate limits
- **E2E (Playwright):**
  - register → verify → profile → publish
  - guest support → success
  - product upload → purchase → download → limit
  - KYC → bind number → withdraw
  - admin restrict → creator blocked
  - cross-origin POST rejected
  - creator A ≠ creator B data
  - XSS payloads inert
- **Sandbox:** run each money flow against **Monime's sandbox/test space** before live.
- **Device testing:** low-end Android + 3G throttling; real Orange Money and AfriMoney checkouts in the pilot.

### Legal & content
Terms, privacy notice, creator/seller agreement, content & prohibited-use policy, takedown/appeals procedure, refund policy. All linked from the footer and checkout.

### Go-live checklist
- [ ] Monime commercial approval for tips + digital goods; production space + platform account created; `MONIME_ENVIRONMENT=live`
- [ ] Webhook registered on the **final canonical host** (no redirect); test event received
- [ ] Legal/compliance review done (PRD §6.5); limits and fees approved and entered in admin
- [ ] Cloudflare Email sending domain verified (SPF/DKIM/DMARC); `EMAIL_ENABLED=true`
- [ ] R2 buckets private, CORS locked, lifecycle rules set
- [ ] Neon roles split (`app_rw`/`migrator`), PITR on, restore tested
- [ ] Cron jobs running and visible in `job_runs`; alerts wired
- [ ] Pilot: 20–30 creators onboarded with a support playbook

---

## Appendix A — Environment variables

```bash
# App
APP_BASE_URL=https://dumegud.com            # canonical host, used for Monime URLs & emails
NODE_ENV=production

# Database (Neon)
DATABASE_URL=postgres://app_rw:…@…-pooler.neon.tech/dumegud?sslmode=require
DATABASE_URL_MIGRATOR=postgres://migrator:…@….neon.tech/dumegud?sslmode=require

# Auth (Auth.js v5)
AUTH_SECRET=…                                # openssl rand -base64 32
AUTH_URL=https://dumegud.com                 # optional on Vercel
AUTH_TRUST_HOST=true
AUTH_GOOGLE_ID=…
AUTH_GOOGLE_SECRET=…

# Monime
MONIME_ENVIRONMENT=fake|test|live            # 'fake' = in-memory client, dev simulator allowed unless 'live'
MONIME_BASE_URL=https://api.monime.io/v1
MONIME_VERSION=caph.2025-08-23               # REQUIRED header
MONIME_ACCESS_TOKEN=…
MONIME_SPACE_ID=…
MONIME_WEBHOOK_SECRET=…
MONIME_PLATFORM_ACCOUNT_ID=fac-…             # created manually in Monime dashboard

# Cloudflare R2
R2_ACCOUNT_ID=…
R2_ACCESS_KEY_ID=…
R2_SECRET_ACCESS_KEY=…
R2_PRODUCTS_BUCKET=dumegud-products          # private
R2_KYC_BUCKET=dumegud-kyc                    # private, separate credentials if possible
R2_PUBLIC_BUCKET=dumegud-public              # avatars/previews (processed images only)
R2_PUBLIC_BASE_URL=https://cdn.dumegud.com

# Email
EMAIL_ENABLED=true|false
EMAIL_PROVIDER=cloudflare|console
EMAIL_FROM="DuMeGud <no-reply@dumegud.com>"
CLOUDFLARE_ACCOUNT_ID=…
CLOUDFLARE_EMAIL_API_TOKEN=…

# Security
FIELD_ENCRYPTION_KEY=…                       # base64 32 bytes; versioned: FIELD_ENCRYPTION_KEY_V2 for rotation
HASH_PEPPER=…                                # for ipHash, payer fingerprint, id number, email hash
DOWNLOAD_SIGNING_SECRET=…
CRON_SECRET=…
UPSTASH_REDIS_REST_URL=…
UPSTASH_REDIS_REST_TOKEN=…

# Observability
SENTRY_DSN=…                                 # if Sentry chosen
```

---

## Appendix B — Monime API reference (as used)

Base: `https://api.monime.io/v1`. Headers: `Authorization: Bearer`, `Monime-Space-Id`, `Monime-Version: caph.2025-08-23`, `Content-Type: application/json`, `Idempotency-Key` (on creates). Responses: `{ success, result }`, sometimes **double-nested** (`result.result`). Errors: `{ success:false, error:{ code, message } }`.

| Purpose | Call | Notes |
|---|---|---|
| Create creator wallet | `POST /financial-accounts` `{ name, currency:'SLE', reference?, description?, metadata? }` | → `{ id:'fac-…', uvan, name, currency, balance:{ available }, … }` |
| Wallet balance | `GET /financial-accounts/{id}?withBalance=true` | `balance.available` may be `{currency,value}`, a number, or null |
| Start checkout | `POST /checkout-sessions` `{ name, successUrl, cancelUrl, financialAccountId, lineItems:[{type:'custom',name,price:{currency,value},quantity,description≤100,reference}], metadata (string values), callbackState, paymentOptions }` | → `{ id:'scs-…', redirectUrl, status, expireTime }` |
| Read checkout | `GET /checkout-sessions/{id}` | `status: pending|completed|failed|cancelled|expired`. **No fees.** |
| Read payment | `GET /payments/{id}` | Needs the `payment.payments:get` scope |
| Platform → creator | `POST /internal-transfers` `{ amount:{currency,value}, sourceFinancialAccount:{id}, destinationFinancialAccount:{id}, description, metadata }` | Zero-value is illegal. `GET /internal-transfers/{id}` → `status` |
| Withdraw | `POST /payouts` `{ destination:{ type:'momo', providerId:'m17'|'m18', phoneNumber:'232XXXXXXXX' }, amount:{value,currency}, source:{financialAccountId}, metadata }` | **Fee charged on top** to the source. → `{ id:'pyt-…', status }` |
| Read payout | `GET /payouts/{id}` | `failureDetail` is an **object** |
| Holder name | `GET /provider-kyc/{providerId}?accountId={msisdn}` | → `account.holderName`. 404 = not registered |

**Webhook envelope**
```jsonc
{ "apiVersion": "caph.2025-08-23",
  "event":  { "id": "wkd-…", "name": "payment.processing_completed", "timestamp": "1784112516" },
  "object": { "id": "spm-…", "type": "payment" },
  "data": {
    "amount": { "currency": "SLE", "value": 30000 },
    "fees": [ { "amount": { "currency": "SLE", "value": 300 }, "code": "Base", "metadata": null } ],
    "channel": { "type": "momo", "provider": "m18", "reference": "MP260715.1048.A32757", "phoneNumber": "+23299****51", "fingerprint": "…" },
    "financialAccountId": "fac-…",
    "financialTransactionReference": "20260715-104836302-SESVFU",
    "ownershipGraph": { "owner": { "type": "checkout_session", "id": "scs-…" } },
    "metadata": { … }, "status": "completed" } }
```

**Payout event `data`**
```jsonc
{ "id": "pyt-…", "amount": { "currency": "SLE", "value": 71000 },
  "destination": { "type": "momo", "providerId": "m17", "phoneNumber": "+232…", "transactionReference": "…" },
  "fees": [ { "amount": { "currency": "SLE", "value": 710 }, "code": "Base" } ],
  "failureDetail": null,                          // or { code: "fund_insufficient", message: "…" }
  "metadata": { "payoutId": "…", "creatorId": "…" },
  "source": { "financialAccountId": "fac-…", "transactionReference": "…" }, "status": "completed" }
```

**Gotchas checklist**
- Amounts are integer minor units; `SLE` (not `SLL`); 1 Le = 100.
- `fees` is an array → sum. A missing fee is `null`, not 0. Polled reads have no fees.
- Two events per payment; either can arrive first.
- The session ID lives at `data.ownershipGraph.owner.id`.
- Phone: send `232XXXXXXXX` (no `+`); webhooks return a masked `+232…`.
- Line item description ≤ 100 chars. Metadata values are strings.
- Idempotency keys must be **deterministic** (`creator-wallet-{userId}`, `checkout-{paymentId}`, `transfer-{paymentId}`, `payout-{payoutId}`).
- Always send `Monime-Version`.
- Register the webhook on the final host. Return 500 for transient failures so Monime retries.
- `MONIME_ENVIRONMENT` must never be `fake` in production (env validation enforces this when `NODE_ENV=production`).

---

## Appendix C — Sequence flows

### C.1 Support payment
```
Supporter      App (action)          DB              Monime            Webhook route        Cron
   │ pick amount ─►│ validate, limits, quote
   │               │── insert payment(created)+contribution ─►│
   │               │────────── POST /checkout-sessions (fac=PLATFORM, key=checkout-{id}) ──►│
   │               │◄───────── { scs-…, redirectUrl } ─────────│
   │               │── payment → pending ──►│
   │◄─ redirect ───│
   │──────────── pays with Orange/AfriMoney on Monime ────────►│
   │◄──────────── redirect to /{handle}/support/success ───────│
   │ poll status ─►│ (shows "Confirming…")
   │               │                                   │── checkout_session.completed ──►│ verify sig, claim
   │               │                                   │                                 │ → succeeded (fee NULL)
   │               │                                   │── payment.processing_completed ►│ verify, claim
   │               │                                   │                                 │ → fee=sum(fees), split, ledger settle
   │               │◄──────────────────────── POST /internal-transfers (key=transfer-{id}) ─│
   │               │                                   │                                 │ → transfer completed, ledger
   │◄─ "Thank you" │ status=succeeded
   │               │                                                         (missed events) ├─ reconcile-payments / retry-transfers
```

### C.2 Product purchase
Same as C.1 with `kind='order'`. In the succeeded transition transaction: `INSERT entitlement ON CONFLICT DO NOTHING`. Then `after()`: receipt email with `/library/{token}`. Download: library → `/api/downloads/{signed}` → check + increment → 302 to a presigned R2 GET (watermarked PDF if applicable).

### C.3 Withdrawal
```
Creator → request(amount) → checks (KYC, method active, limits, live provider-KYC, balance=min(live,ledger) fail-closed)
  → insert payout(requested|in_review) → [in_review: wait for admin release]
  → POST /payouts (key=payout-{id}, source=creator fac) → processing
  → webhook payout.completed|failed (or reconcile-payouts) → completionApplied once → ledger, email
```

---

## Appendix D — Data model summary

| Domain | Tables |
|---|---|
| Auth | `users`, `accounts`, `verification_tokens`, `password_reset_tokens`, `auth_events` |
| Creators | `creator_profiles`, `social_links`, `categories`, `reserved_handles`, `handle_history`, `creator_wallets` |
| Payments | `payments`, `payment_events`, `contributions`, `webhook_events` |
| Products | `products`, `product_assets`, `orders`, `entitlements`, `download_events` |
| Wallet | `kyc_submissions`, `payout_methods`, `payouts`, `ledger_entries` |
| Risk | `transaction_limits`, `risk_rules`, `risk_alerts`, `risk_cases`, `account_restrictions`, `content_reports`, `moderation_actions` |
| Admin/Ops | `platform_settings`, `platform_settings_history`, `audit_logs`, `job_runs` |

**Critical unique constraints:**
- `users.email`
- `creator_profiles.handleLower`
- `creator_wallets.creatorId`, `creator_wallets.monimeFinancialAccountId`
- `payments.idempotencyKey`, `payments.monimeCheckoutSessionId`, `payments.monimePaymentId`
- `webhook_events(provider, providerEventId)`
- `entitlements.orderId`
- `payouts.monimePayoutId`, `payouts.idempotencyKey`, partial unique "one open payout per creator"
- `ledger_entries.idempotencyKey`
- `kyc_submissions.idNumberHash WHERE status='approved'`

**Hot indexes:**
- `payments(creatorId, status, createdAt)`, `payments(status, createdAt)`
- `payments(payerFingerprintHash, settledAt)`, `payments(ipHash, createdAt)`
- `payouts(status, requestedAt)`
- `ledger_entries(account, createdAt)`
- `risk_alerts(status, createdAt)`
- `audit_logs(targetType, targetId, createdAt)`

**Append-only (no UPDATE/DELETE for `app_rw`):** `audit_logs`, `ledger_entries`, `payment_events`, `auth_events`, `download_events`.

---

## Appendix E — PRD acceptance criteria → phase → test

| PRD §13 criterion | Phase | Test |
|---|---|---|
| Creator can register, select a unique handle, publish a compliant profile | 1, 2 | E2E `onboarding.spec` |
| Guest supporter can open the page and initiate a one-off contribution | 4 | E2E `support.spec` |
| System confirms contribution only after verified payment status | 3, 4 | Integration `settlement.test` (redirect without webhook ≠ success) |
| Creator can upload an approved digital file and publish a product listing | 5 | E2E `product.spec` |
| Buyer can pay, obtain entitlement, download via temporary secure URL | 5 | E2E `purchase.spec` |
| Replaying a webhook doesn't duplicate revenue or entitlements | 3, 4, 5 | Integration `webhook-replay.test` |
| Private R2 objects can't be fetched publicly | 5 | Integration `r2-private.test` |
| Risk rules flag rapid payments and volume-limit breaches | 7 | Integration `risk-rules.test` |
| Admin can adjust limits and fees without redeploy, with audit history | 7, 8 | E2E `admin-settings.spec` |
| Staff can review alerts, restrict accounts, document case decisions | 7, 8 | E2E `cases.spec` |
| Non-admins can't access admin APIs or other creators' data | 1, 8 | E2E `authz.spec` |
| Pending, failed, canceled, reversed payments handled safely | 4, 9 | Unit `payment-state.test` + integration |
| Terms, policies, privacy, reporting paths accessible | 10 | E2E `legal-links.spec` |
| Payment partner + legal readiness validated before real money | 10 | Go-live checklist |
| *(added)* CSRF/XSS/SQLi/rate-limit controls effective | 0, 10 | `security.spec` + unit |

---

## Appendix F — Open items

1. **Fee rates:** final `contributionBps` / `productBps` (PRD hypotheses: 3% / 5%). Model against the ~1% Monime collection fee + ~1% payout fee. Enter in admin; never hardcode.
2. **Production limits** (PRD §6.2 figures are illustrative only).
3. **Monime approval** for tips + digital goods, and confirmation that **internal transfers carry no fee** (ib4me observed none; verify in the sandbox).
4. **Card payments:** enable or not (`paymentOptions.card.disable`).
5. **Cloudflare Email Sending API:** confirm the endpoint/payload against the official docs; domain onboarding.
6. **Malware scanning vendor** (MVP = manual review + magic-byte checks).
7. **Upload type/size allow-list** and **refund policy**. Refunds are manual/off-platform at MVP (Monime refund API unused in ib4me) and recorded as `reversed` + ledger reversal by admin.
8. **Auth.js v5 stability:** v5 is still published as `beta` on npm (`5.0.0-beta.32` at time of writing). Pin exactly and track releases.
9. **Brand:** final palette/typography/logo (tokens are swappable).
10. **Error tracking vendor** (Sentry vs Vercel Observability).
11. **PRD update:** change "Authentication: Better Auth" → "NextAuth (Auth.js v5)" and "Payout / wallet architecture: Undecided" → the platform-first model above.
