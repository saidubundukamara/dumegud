import "server-only";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool as PgPool } from "pg";
import ws from "ws";
import { getEnv } from "@/server/env";
import * as schema from "./schema";

// neon-serverless (Pool over WebSocket) rather than neon-http: we need interactive transactions.
neonConfig.webSocketConstructor = ws;

function createNeonDb(connectionString: string) {
  const pool = new Pool({ connectionString });
  return drizzle({ client: pool, schema, casing: "snake_case" });
}

// Local Postgres (docker-compose.yml) speaks plain TCP, not Neon's WebSocket protocol, so it
// gets node-postgres. Same Postgres dialect and interactive transactions; only the driver differs.
function isLocalDatabase(connectionString: string) {
  return ["localhost", "127.0.0.1"].includes(new URL(connectionString).hostname);
}

function createDb(): DB {
  const { DATABASE_URL } = getEnv();
  if (isLocalDatabase(DATABASE_URL)) {
    const pool = new PgPool({ connectionString: DATABASE_URL });
    return drizzlePg({ client: pool, schema, casing: "snake_case" }) as unknown as DB;
  }
  return createNeonDb(DATABASE_URL);
}

export type DB = ReturnType<typeof createNeonDb>;
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
