import "server-only";
import { z } from "zod";

// Server environment, validated on first access (not at import) so `next build` works without
// secrets. Variables for later phases are added here when the phase that uses them lands; the
// full list lives in .env.example.

const optionalUrl = z.preprocess((v) => (v === "" ? undefined : v), z.url().optional());
const optionalString = z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).optional());

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_BASE_URL: z.url(),

    DATABASE_URL: z.url(),

    // Upstash (rate limiting). Optional outside production: falls back to an in-memory limiter.
    UPSTASH_REDIS_REST_URL: optionalUrl,
    UPSTASH_REDIS_REST_TOKEN: optionalString,

    // Pepper for hashing IPs / fingerprints / identifiers before they are stored or used as keys.
    HASH_PEPPER: z.string().min(32),

    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
      ctx.addIssue({
        code: "custom",
        path: ["UPSTASH_REDIS_REST_URL"],
        message: "Upstash Redis is required in production (rate limiting must be shared across instances)",
      });
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test-only: forget the cached env so a test can change process.env. */
export function resetEnvForTests() {
  cached = undefined;
}
