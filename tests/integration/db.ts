import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { setDbForTests } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { runInTransaction } from "@/server/services/transaction";

/**
 * A real Postgres (PGlite, in-process WASM) with every migration applied, wired in as the
 * database all repositories use. Lets integration tests exercise the actual SQL: guarded
 * updates, unique constraints, ON CONFLICT and transactions.
 */
export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle({ client, schema, casing: "snake_case" });
  await migrate(db, { migrationsFolder: "server/db/migrations" });
  setDbForTests(db);
  return { db, client, close: () => client.close() };
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>;

/**
 * A transaction runner that first commits `competing` (once): simulates another request landing
 * between a service's unlocked checks and its locked transaction. PGlite has one connection, so
 * real interleavings can't be produced; this reproduces the worst one deterministically.
 */
export function racingTransaction(competing: () => Promise<unknown>): typeof runInTransaction {
  let done = false;
  return (async (fn: Parameters<typeof runInTransaction>[0]) => {
    if (!done) {
      done = true;
      await competing();
    }
    return runInTransaction(fn);
  }) as typeof runInTransaction;
}
