import { desc, sql, type AnyColumn, type SQL } from "drizzle-orm";
import type { Cursor } from "@/server/lib/cursor";

// Newest-first keyset pagination over (timestamp, id). Postgres stores microseconds but a cursor
// carries a JS Date (milliseconds), so both the ordering and the comparison use the timestamp
// truncated to milliseconds; otherwise rows within the same millisecond could be skipped.

const ms = (column: AnyColumn) => sql`date_trunc('milliseconds', ${column})`;

/** Rows strictly older than the cursor (undefined = no condition, the first page). */
export function olderThan(at: AnyColumn, id: AnyColumn, cursor: Cursor | null | undefined): SQL | undefined {
  if (!cursor) return undefined;
  const t = sql`${cursor.at.toISOString()}::timestamptz`;
  return sql`(${ms(at)} < ${t} or (${ms(at)} = ${t} and ${id} < ${cursor.id}::uuid))`;
}

export function newestFirst(at: AnyColumn, id: AnyColumn): SQL[] {
  return [sql`${ms(at)} desc`, desc(id)];
}
