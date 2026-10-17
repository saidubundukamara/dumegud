import "server-only";
import { Ratelimit, type Duration } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { getEnv } from "@/server/env";
import { RateLimitedError } from "./errors";
import { pepperedHash } from "./hash";

// Central rate-limit policies (implementation.md §4). Callers pass a policy name plus an
// identifier (IP, email, user id, creator id …); identifiers are hashed before becoming keys so
// no raw PII is stored in Redis.

type Policy = { limit: number; window: Duration };

export const RATE_LIMIT_POLICIES = {
  "login:email": { limit: 5, window: "15 m" },
  "login:ip": { limit: 20, window: "15 m" },
  "register:ip": { limit: 5, window: "1 h" },
  "password-reset:email": { limit: 3, window: "1 h" },
  "verify-email:user": { limit: 3, window: "1 h" },
  "checkout:ip": { limit: 10, window: "10 m" },
  "checkout:creator": { limit: 30, window: "10 m" },
  "payment-status:ip": { limit: 120, window: "10 m" },
  "upload:user": { limit: 30, window: "1 h" },
  "download:entitlement": { limit: 20, window: "1 h" },
  "download:ip": { limit: 60, window: "1 h" },
  "library-recovery:email": { limit: 3, window: "1 h" },
  "library-recovery:ip": { limit: 10, window: "1 h" },
  "provider-kyc:user": { limit: 5, window: "1 h" },
  /** Each withdrawal attempt costs a Monime provider-KYC lookup. */
  "payout:user": { limit: 10, window: "1 h" },
  "report:ip": { limit: 10, window: "1 h" },
} as const satisfies Record<string, Policy>;

export type RateLimitPolicy = keyof typeof RATE_LIMIT_POLICIES;

export type RateLimitOutcome = { success: boolean; remaining: number; reset: number };

interface Limiter {
  limit(key: string): Promise<RateLimitOutcome>;
}

// ── In-memory sliding window (dev/test only: not shared across instances) ────────

const UNIT_MS = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 } as const;

export function durationToMs(window: Duration): number {
  const match = /^(\d+)\s?(ms|s|m|h|d|w)$/.exec(window);
  if (!match) throw new Error(`Invalid rate-limit window: ${window}`);
  return Number(match[1]) * UNIT_MS[match[2] as keyof typeof UNIT_MS];
}

export class MemoryLimiter implements Limiter {
  private hits = new Map<string, number[]>();
  constructor(
    private readonly policy: Policy,
    private readonly now: () => number = Date.now,
  ) {}

  async limit(key: string): Promise<RateLimitOutcome> {
    const windowMs = durationToMs(this.policy.window);
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((ts) => ts > t - windowMs);
    const success = recent.length < this.policy.limit;
    if (success) recent.push(t);
    this.hits.set(key, recent);
    const oldest = recent[0] ?? t;
    return { success, remaining: Math.max(0, this.policy.limit - recent.length), reset: oldest + windowMs };
  }
}

// ── Limiter registry ─────────────────────────────────────────────────────────────

const limiters = new Map<RateLimitPolicy, Limiter>();
let redis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const env = getEnv();
  redis =
    env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
      ? new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN })
      : null;
  return redis;
}

function getLimiter(name: RateLimitPolicy): Limiter {
  let limiter = limiters.get(name);
  if (limiter) return limiter;
  const policy = RATE_LIMIT_POLICIES[name];
  const client = getRedis();
  limiter = client
    ? new Ratelimit({
        redis: client,
        limiter: Ratelimit.slidingWindow(policy.limit, policy.window),
        prefix: `rl:${name}`,
        timeout: 1_000, // fail open on Redis latency; Vercel Firewall is the outer layer
      })
    : new MemoryLimiter(policy);
  limiters.set(name, limiter);
  return limiter;
}

/** Check a policy without throwing. */
export async function checkRateLimit(name: RateLimitPolicy, identifier: string): Promise<RateLimitOutcome> {
  return getLimiter(name).limit(pepperedHash(`rl:${name}`, identifier));
}

/** Enforce a policy; throws RateLimitedError (→ 429 / friendly action error) when exceeded. */
export async function enforceRateLimit(name: RateLimitPolicy, identifier: string): Promise<void> {
  const { success, reset } = await checkRateLimit(name, identifier);
  if (!success) throw new RateLimitedError(Math.max(1, Math.ceil((reset - Date.now()) / 1000)));
}
