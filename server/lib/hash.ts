import "server-only";
import { createHmac } from "node:crypto";
import { getEnv } from "@/server/env";

/**
 * Keyed one-way hash for identifiers we need to correlate but must not store raw
 * (IP addresses, payer fingerprints, emails used as lookup keys, ID numbers).
 * Namespaced so the same raw value hashes differently per purpose.
 */
export function pepperedHash(namespace: string, value: string): string {
  return createHmac("sha256", getEnv().HASH_PEPPER).update(`${namespace}:${value}`).digest("base64url");
}
