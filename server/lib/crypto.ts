import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/server/env";

/** URL-safe random token for emailed links (verify email, reset password). 32 bytes = 256 bits. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/**
 * Hash of a high-entropy random token for storage. No pepper needed: the input is 256 random
 * bits, so the stored value can't be brute-forced; it only stops a DB read from yielding
 * usable links.
 */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

// ── Field encryption ──────────────────────────────────────────────────────────────
// AES-256-GCM for personal data we must be able to read back (buyer emails, KYC fields).
// Format: `v1.<iv>.<tag>.<ciphertext>` (base64url). "v1" is the current key, "v0" the previous
// one during a rotation; re-encrypt with encryptField after decrypting a v0 value.

function fieldKey(version: "v1" | "v0"): Buffer {
  const env = getEnv();
  const b64 = version === "v1" ? env.FIELD_ENCRYPTION_KEY : env.FIELD_ENCRYPTION_KEY_PREVIOUS;
  if (!b64) throw new Error(`field encryption key ${version} is not configured`);
  return Buffer.from(b64, "base64");
}

export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", fieldKey("v1"), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptField(value: string): string {
  const [version, iv, tag, ct] = value.split(".");
  if ((version !== "v1" && version !== "v0") || !iv || !tag || ct === undefined) throw new Error("malformed encrypted field");
  const decipher = createDecipheriv("aes-256-gcm", fieldKey(version), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

// ── Signed, expiring tokens ───────────────────────────────────────────────────────

/** `<base64url payload>.<hmac>`. Verification is constant-time. */
export function signToken(payload: string, secret: string): string {
  const body = Buffer.from(payload, "utf8").toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

export function verifySignedToken(token: string, secret: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0 || token.length > 512) return null;
  const body = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1), "base64url");
  const expected = createHmac("sha256", secret).update(body).digest();
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return Buffer.from(body, "base64url").toString("utf8");
}
