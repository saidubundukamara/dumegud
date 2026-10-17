import "server-only";
import { createHash, randomBytes } from "node:crypto";

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
