import { describe, expect, it } from "vitest";
import { RateLimitedError } from "@/server/lib/errors";
import { durationToMs, enforceRateLimit, MemoryLimiter, RATE_LIMIT_POLICIES } from "@/server/lib/rate-limit";

describe("durationToMs", () => {
  it("parses Upstash-style durations", () => {
    expect(durationToMs("15 m")).toBe(900_000);
    expect(durationToMs("1h")).toBe(3_600_000);
    expect(durationToMs("10 s")).toBe(10_000);
  });
});

describe("MemoryLimiter", () => {
  it("allows up to the limit within the window, then blocks, then recovers", async () => {
    let now = 0;
    const limiter = new MemoryLimiter({ limit: 2, window: "10 s" }, () => now);
    expect((await limiter.limit("k")).success).toBe(true);
    expect((await limiter.limit("k")).success).toBe(true);
    expect((await limiter.limit("k")).success).toBe(false);
    expect((await limiter.limit("other")).success).toBe(true);
    now = 10_001;
    expect((await limiter.limit("k")).success).toBe(true);
  });
});

describe("enforceRateLimit (in-memory fallback, no Upstash env)", () => {
  it("throws RateLimitedError once the policy is exceeded", async () => {
    const { limit } = RATE_LIMIT_POLICIES["login:email"];
    const id = `user-${Math.random()}@example.com`;
    for (let i = 0; i < limit; i++) await enforceRateLimit("login:email", id);
    await expect(enforceRateLimit("login:email", id)).rejects.toBeInstanceOf(RateLimitedError);
  });
});
