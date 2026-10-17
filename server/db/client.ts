import "server-only";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { getEnv } from "@/server/env";
import * as schema from "./schema";

// neon-serverless (Pool over WebSocket) rather than neon-http: we need interactive transactions.
neonConfig.webSocketConstructor = ws;

function createDb() {
  const pool = new Pool({ connectionString: getEnv().DATABASE_URL });
  return drizzle({ client: pool, schema, casing: "snake_case" });
}

export type DB = ReturnType<typeof createDb>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
/** Anything a repository can run a query on: the root db or an open transaction. */
export type Executor = DB | Tx;

const globalForDb = globalThis as unknown as { __dumegudDb?: DB };

/** Lazily created so importing this module never needs DATABASE_URL (e.g. during `next build`). */
export function getDb(): DB {
  // Reuse across dev hot reloads so we don't leak pools.
  globalForDb.__dumegudDb ??= createDb();
  return globalForDb.__dumegudDb;
}

/** Test-only: point every repository at another Drizzle Postgres database (PGlite in tests). */
export function setDbForTests(db: unknown): void {
  globalForDb.__dumegudDb = db as DB;
}
