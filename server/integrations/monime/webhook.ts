import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

// Monime webhook signatures: header `monime-signature: t=<unix seconds>,v1=<base64>`, where
// v1 = base64(HMAC-SHA256(secret, `${t}_${rawBody}`)). Verify against the RAW body, before
// parsing. Several v1 values are accepted (secret rotation).

export const SIGNATURE_MAX_AGE_SECONDS = 300;
export const SIGNATURE_MAX_SKEW_SECONDS = 60;

export type SignatureCheck = { ok: true } | { ok: false; reason: "no_secret" | "malformed" | "expired" | "future" | "mismatch" };

export function parseSignatureHeader(header: string | null): { t: number; v1: string[] } | null {
  if (!header || header.length > 1024) return null;
  let t: number | null = null;
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("="); // split on the FIRST "=": base64 values end in "=" padding
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t" && /^\d{1,12}$/.test(value)) t = Number(value);
    else if (key === "v1" && value) v1.push(value);
  }
  return t !== null && v1.length ? { t, v1 } : null;
}

export function signMonimePayload(rawBody: string, secret: string, t: number): string {
  const v1 = createHmac("sha256", secret).update(`${t}_${rawBody}`, "utf8").digest("base64");
  return `t=${t},v1=${v1}`;
}

export function verifyMonimeSignature(
  rawBody: string,
  header: string | null,
  secret: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): SignatureCheck {
  if (!secret) return { ok: false, reason: "no_secret" };
  const parsed = parseSignatureHeader(header);
  if (!parsed) return { ok: false, reason: "malformed" };

  const age = nowSeconds - parsed.t;
  if (age > SIGNATURE_MAX_AGE_SECONDS) return { ok: false, reason: "expired" };
  if (age < -SIGNATURE_MAX_SKEW_SECONDS) return { ok: false, reason: "future" };

  const expected = createHmac("sha256", secret).update(`${parsed.t}_${rawBody}`, "utf8").digest();
  const match = parsed.v1.some((candidate) => {
    const given = Buffer.from(candidate, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  return match ? { ok: true } : { ok: false, reason: "mismatch" };
}

/** The envelope fields we rely on. `data` stays loose: each handler validates what it reads. */
export const monimeEventSchema = z.object({
  apiVersion: z.string().max(64).optional(),
  event: z.object({
    id: z.string().min(1).max(200),
    name: z.string().min(1).max(100),
    timestamp: z.union([z.string(), z.number()]).optional(),
  }),
  object: z.object({ id: z.string().max(200), type: z.string().max(100) }).partial().optional(),
  data: z.record(z.string(), z.unknown()).default({}),
});

export type MonimeEvent = z.infer<typeof monimeEventSchema>;

/** Parse a verified raw body. Returns null for invalid JSON or a malformed envelope. */
export function parseMonimeEvent(rawBody: string): MonimeEvent | null {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const parsed = monimeEventSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}
