import "server-only";
import { getDb, type Executor } from "@/server/db/client";

/**
 * Repositories are the only layer that talks to Drizzle. Every method takes an optional
 * executor so services can compose several repositories inside one transaction:
 *
 *   await runInTransaction(async (tx) => {
 *     const payment = await repos.payments.insert(data, tx);
 *     await repos.paymentEvents.append(payment.id, …, tx);
 *   });
 *
 * Repositories hold no business rules and never call external services. Ownership filters
 * (e.g. `AND creator_id = ?`) belong in the WHERE clause of owner-scoped queries.
 */
export abstract class BaseRepository {
  protected exec(tx?: Executor): Executor {
    return tx ?? getDb();
  }
}

/** True for a Postgres unique-constraint violation (23505), however the driver wraps it. */
export function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && depth < 4; e = (e as { cause?: unknown }).cause, depth++) {
    if ((e as { code?: unknown }).code === "23505") return true;
  }
  return false;
}
