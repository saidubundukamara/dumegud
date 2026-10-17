# DuMeGud

**Support creators. Fuel good.** *(working tagline)*

DuMeGud ("do me good") is a creator-support and digital-commerce platform for Sierra Leone. Creators get a shareable page where supporters can send **one-off contributions** and buy **digital products**, paying with local mobile money (Orange Money, AfriMoney) through [Monime]. Supporters don't need an app or an account, just a browser.

> **Status:** Phases 0–5 (foundations, authentication, creator profile and wallet, Monime integration core, one-off support, digital products) are complete. Next up is Phase 6 (wallet, KYC and payouts). See [`implementation.md`](./implementation.md) for the roadmap.

## Documentation

| Document | What it covers |
|---|---|
| [`PRD.md`](./PRD.md) | Product requirements: goals, user journeys, AML/risk controls, brand direction |
| [`implementation.md`](./implementation.md) | Phased engineering plan (Phases 0–10), decision log, money model, security threat model, Monime API reference, data model |
| [`CLAUDE.md`](./CLAUDE.md) / [`AGENTS.md`](./AGENTS.md) | Guidance for AI coding agents working in this repo |

Where `implementation.md` and the PRD disagree, the **decision log in `implementation.md` §0** wins.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16.4 (App Router, Cache Components, Partial Prefetching), React 19, TypeScript (strict) |
| Styling | Tailwind CSS 4 + semantic design tokens (`styles/tokens.css`) |
| Database | Neon Postgres + Drizzle ORM / Drizzle Kit |
| Auth *(Phase 1)* | Auth.js v5: email + password (Argon2id) and Google |
| Payments *(Phase 2–6)* | Monime: checkout sessions, per-creator financial accounts (wallets), internal transfers, payouts |
| Files *(Phase 5)* | Cloudflare R2 (private buckets, presigned URLs) |
| Email *(Phase 1)* | Cloudflare Email Sending (toggle with `EMAIL_ENABLED`) |
| Rate limiting | Upstash Redis (in-memory fallback in development) |
| Hosting | Vercel (Fluid Compute, Vercel Cron) |
| Testing | Vitest (unit/integration), Playwright (E2E) |

> **Note:** This project runs Next.js 16, which differs from older versions. For example, middleware is now `proxy.ts`, and request APIs (`cookies()`, `params`, …) are async. Check the bundled docs in `node_modules/next/dist/docs/` before writing framework code.

## Getting started

**Requirements:** Node.js 22 or newer (CI and Vercel use Node 24) and npm.

```bash
npm install
cp .env.example .env.local   # then fill in the values for the current phase
npm run dev                  # http://localhost:3000
```

Minimum `.env.local` (through Phase 5):

| Variable | Notes |
|---|---|
| `APP_BASE_URL` | `http://localhost:3000` locally |
| `DATABASE_URL` | Neon **pooled** connection string. Run `npm run db:migrate` once. |
| `HASH_PEPPER` | Random secret, at least 32 chars (`openssl rand -base64 48`) |
| `AUTH_SECRET` | Random secret, at least 32 chars (`openssl rand -base64 32`) |
| `FIELD_ENCRYPTION_KEY` | `openssl rand -base64 32` (encrypts buyer emails) |
| `DOWNLOAD_SIGNING_SECRET` | `openssl rand -base64 48` (signs download links) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Optional. The Google button only appears when both are set. Redirect URI: `{APP_BASE_URL}/api/auth/callback/google` |

Monime defaults to `MONIME_ENVIRONMENT=fake` (an in-memory Monime), so wallets "provision" instantly in dev. With the fake, `POST /api/dev/monime-webhook` creates checkouts and fires signed webhooks at the app (see the route file for actions). Profile photos need the R2 variables (see `.env.example`); without them the upload control is hidden.

With `EMAIL_ENABLED=false` (the default), emails aren't sent: in dev their text, including verify/reset links, is printed to the server console.

`.env.example` lists every variable along with the phase that introduces it. Env vars are validated on first use (`server/env.ts`), so `npm run build` works without secrets.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` / `npm start` | Production build / serve it |
| `npm run lint` | ESLint (`next lint` was removed in Next 16) |
| `npm run typecheck` | Generate route types, then `tsc --noEmit` |
| `npm test` | Unit and integration tests (Vitest; integration tests run every migration on in-process PGlite) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:coverage` | Tests with a coverage report |
| `npm run test:e2e` | Playwright E2E: builds and starts the app, or targets `E2E_BASE_URL` |
| `npm run db:generate` | Generate a SQL migration from the Drizzle schema |
| `npm run db:migrate` | Apply migrations (uses `DATABASE_URL_MIGRATOR`, falling back to `DATABASE_URL`) |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run audit:prod` | `npm audit` on production dependencies |

Running a single test:

```bash
npx vitest run tests/unit/money.test.ts
npx vitest run -t "floors, never rounds"
npx playwright test tests/e2e/security-headers.spec.ts
```

If the Playwright browser download fails, use an installed Chrome instead: `PW_CHANNEL=chrome npm run test:e2e`.

## Project structure

```text
app/                    Routes (App Router). Route groups planned: (marketing) (auth) (creator) (admin)
lib/                    Pure helpers safe for client and server (e.g. money.ts)
server/
  env.ts                Zod-validated environment
  db/                   Drizzle client, schema (one file per domain), migrations
  repositories/         Database access only (extend BaseRepository)
  services/             Business logic, authorization, integrations; index.ts wires everything
  lib/                  errors, logger, rate limiting, origin (CSRF) check, hashing
styles/tokens.css       Brand/design tokens (the only place brand colours are defined)
tests/                  unit/, integration/, e2e/
instrumentation.ts      Server error reporting hook
```

## Architecture in brief

```text
Server Action / Route Handler  →  Service  →  Repository  →  Drizzle → Neon
   (validate, auth, map DTO)      (rules,      (queries only)
                                   Monime/R2/email)
```

- **Only repositories touch the database**, and ESLint enforces this.
- **No external calls inside DB transactions.** Write the intent row, commit, call the provider with a deterministic idempotency key, then record the result.
- **Money is integer minor units of SLE** (1 Le = 100). Fees always use `Math.floor`.
- **Money flow:** supporter → Monime checkout → DuMeGud platform account → signed webhook → internal transfer of the net amount to the creator's own Monime wallet → payout to the creator's verified mobile money number. See `implementation.md` §3.

## Security baseline

- A static Content-Security-Policy and hardening headers are set in `next.config.ts`. Nonce-based CSP is not used because it is incompatible with Partial Prerendering. E2E tests fail on any CSP violation.
- Server Actions accept same-origin requests only. Mutating route handlers call `assertSameOrigin`.
- Central rate-limit policies (`server/lib/rate-limit.ts`). IPs and identifiers are peppered-hashed before storage.
- ESLint bans `sql.raw()` and `dangerouslySetInnerHTML`.
- The logger redacts PII and secrets.

The full threat model (CSRF, XSS, SQL injection, DDoS, webhook spoofing, IDOR, and more) is in `implementation.md` §4.

## Deployment

The app is deployed on Vercel. CI (`.github/workflows/ci.yml`) runs audit → typecheck → lint → unit tests → build → E2E on every push and PR. Production needs real values for every variable used by the deployed phases, including Upstash Redis.

[Monime]: https://monime.io
