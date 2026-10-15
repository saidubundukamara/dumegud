import "server-only";
import { getDb, type Tx } from "@/server/db/client";

/**
 * Run `fn` in a database transaction.
 *
 * NEVER call Monime, R2, email or any other network service inside `fn`: a slow provider then
 * holds row locks and connections, and a rollback after the provider succeeded leaves orphaned
 * external state. Pattern: write the intent row → commit → call the provider (with a
 * deterministic idempotency key) → record the result in a second transaction.
 */
export function runInTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(fn);
}
