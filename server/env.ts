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
    // Escape hatch for production *builds* run in CI/E2E (`next start` without Upstash).
    // Refused on Vercel production.
    ALLOW_MEMORY_RATE_LIMIT: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),

    // Pepper for hashing IPs / fingerprints / identifiers before they are stored or used as keys.
    HASH_PEPPER: z.string().min(32),

    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

    // Auth.js reads AUTH_SECRET / AUTH_GOOGLE_* itself; they are validated here so a bad deploy
    // fails loudly. Google sign-in is offered only when both Google values are set.
    AUTH_SECRET: z.string().min(32),
    AUTH_GOOGLE_ID: optionalString,
    AUTH_GOOGLE_SECRET: optionalString,

    // Email. Disabled → ConsoleEmailService (dev only logging, nothing is sent).
    EMAIL_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    EMAIL_PROVIDER: z.enum(["cloudflare", "smtp", "console"]).default("console"),
    EMAIL_FROM: z.string().min(3).default("DuMeGud <no-reply@dumegud.com>"),
    CLOUDFLARE_ACCOUNT_ID: optionalString,
    CLOUDFLARE_EMAIL_API_TOKEN: optionalString,
    /** SMTP server for EMAIL_PROVIDER=smtp (local Mailpit: smtp://localhost:1025). */
    SMTP_URL: optionalUrl,

    // Monime. `fake` = in-memory client for dev/tests (never on Vercel production).
    MONIME_ENVIRONMENT: z.enum(["fake", "test", "live"]).default("fake"),
    MONIME_BASE_URL: z.url().default("https://api.monime.io/v1"),
    MONIME_VERSION: z.string().min(1).default("caph.2025-08-23"),
    MONIME_ACCESS_TOKEN: optionalString,
    MONIME_SPACE_ID: optionalString,
    /** HMAC secret for webhook signatures. Without it every webhook is rejected. */
    MONIME_WEBHOOK_SECRET: optionalString,
    /** The DuMeGud platform financial account (fac-…) every checkout pays into. */
    MONIME_PLATFORM_ACCOUNT_ID: optionalString,

    // Cloudflare R2. Optional until set up: avatar upload is hidden while unconfigured.
    R2_ACCOUNT_ID: optionalString,
    R2_ACCESS_KEY_ID: optionalString,
    R2_SECRET_ACCESS_KEY: optionalString,
    /** S3 endpoint override (local MinIO: http://localhost:9000). Defaults to the R2 account endpoint. */
    R2_ENDPOINT: optionalUrl,
    /** Private bucket where browsers PUT raw uploads before the server validates them. */
    R2_UPLOADS_BUCKET: z.string().min(1).default("dumegud-uploads"),
    /** Public bucket for re-encoded images (avatars), served from R2_PUBLIC_BASE_URL. */
    R2_PUBLIC_BUCKET: z.string().min(1).default("dumegud-public"),
    R2_PUBLIC_BASE_URL: optionalUrl,
    /** Private bucket for sellable files (and their watermarked copies). */
    R2_PRODUCTS_BUCKET: z.string().min(1).default("dumegud-products"),
    /** Private bucket for identity documents; separate so its access can be audited and locked down. */
    R2_KYC_BUCKET: z.string().min(1).default("dumegud-kyc"),

    // Field encryption (AES-256-GCM) for buyer emails and, later, KYC data. Base64, 32 bytes.
    // Set FIELD_ENCRYPTION_KEY_PREVIOUS while rotating so old values still decrypt.
    FIELD_ENCRYPTION_KEY: z.base64().refine((v) => Buffer.from(v, "base64").length === 32, "Must be 32 bytes, base64"),
    FIELD_ENCRYPTION_KEY_PREVIOUS: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.base64().refine((v) => Buffer.from(v, "base64").length === 32, "Must be 32 bytes, base64").optional(),
    ),
    /** HMAC key for 60-second download tokens. */
    DOWNLOAD_SIGNING_SECRET: z.string().min(32),

    /** Bearer secret Vercel Cron sends to /api/cron/*. Required in production. */
    CRON_SECRET: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(16).optional()),
  })
  .superRefine((env, ctx) => {
    if (env.EMAIL_ENABLED && env.EMAIL_PROVIDER === "cloudflare") {
      for (const key of ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_EMAIL_API_TOKEN"] as const) {
        if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: "Required when EMAIL_PROVIDER=cloudflare" });
      }
    }
    if (env.EMAIL_ENABLED && env.EMAIL_PROVIDER === "smtp" && !env.SMTP_URL) {
      ctx.addIssue({ code: "custom", path: ["SMTP_URL"], message: "Required when EMAIL_PROVIDER=smtp" });
    }
    if (env.VERCEL_ENV === "production" && !env.CRON_SECRET) {
      ctx.addIssue({ code: "custom", path: ["CRON_SECRET"], message: "Required in production (Vercel Cron authenticates with it)" });
    }
    if (env.MONIME_ENVIRONMENT !== "fake") {
      for (const key of ["MONIME_ACCESS_TOKEN", "MONIME_SPACE_ID", "MONIME_WEBHOOK_SECRET", "MONIME_PLATFORM_ACCOUNT_ID"] as const) {
        if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: "Required unless MONIME_ENVIRONMENT=fake" });
      }
    }
    if (env.VERCEL_ENV === "production" && env.MONIME_ENVIRONMENT === "fake") {
      ctx.addIssue({ code: "custom", path: ["MONIME_ENVIRONMENT"], message: "The fake Monime client can't run on Vercel production" });
    }
    if (env.NODE_ENV !== "production") return;
    if (env.ALLOW_MEMORY_RATE_LIMIT && env.VERCEL_ENV === "production") {
      ctx.addIssue({
        code: "custom",
        path: ["ALLOW_MEMORY_RATE_LIMIT"],
        message: "ALLOW_MEMORY_RATE_LIMIT is for CI/E2E only and can't be used on Vercel production",
      });
    }
    if (env.ALLOW_MEMORY_RATE_LIMIT) return;
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

/** R2 credentials and public URL, or null while R2 isn't configured. */
export function getR2Config(env: Env = getEnv()) {
  const { R2_ACCOUNT_ID, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BASE_URL } = env;
  const endpoint = R2_ENDPOINT ?? (R2_ACCOUNT_ID && `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);
  if (!endpoint || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_PUBLIC_BASE_URL) return null;
  return {
    endpoint: endpoint.replace(/\/$/, ""),
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    uploadsBucket: env.R2_UPLOADS_BUCKET,
    publicBucket: env.R2_PUBLIC_BUCKET,
    productsBucket: env.R2_PRODUCTS_BUCKET,
    publicBaseUrl: R2_PUBLIC_BASE_URL.replace(/\/$/, ""),
  };
}

/** Fixed secret for the fake Monime only (refused on Vercel production), so the dev simulator works without setup. */
const FAKE_WEBHOOK_SECRET = "dumegud-fake-monime-webhook-secret";

/** The secret webhooks are verified with. Undefined means "reject everything". */
export function getMonimeWebhookSecret(env: Env = getEnv()): string | undefined {
  return env.MONIME_WEBHOOK_SECRET ?? (env.MONIME_ENVIRONMENT === "fake" ? FAKE_WEBHOOK_SECRET : undefined);
}
