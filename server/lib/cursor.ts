// Keyset pagination for admin lists, newest first: the cursor is the last row's (timestamp, id),
// opaque to the browser. A tampered or stale cursor decodes to null (= first page), never an error.

export type Cursor = { at: Date; id: string };

/** One page of rows plus the cursor for the next (older) page, if there is one. */
export type Page<T> = { rows: T[]; next: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(at: Date, id: string): string {
  return Buffer.from(`${at.getTime()}.${id}`).toString("base64url");
}

export function decodeCursor(raw: unknown): Cursor | null {
  if (typeof raw !== "string" || !raw || raw.length > 120) return null;
  const [ms, id] = Buffer.from(raw, "base64url").toString().split(".", 2);
  const at = new Date(Number(ms));
  if (!id || !UUID.test(id) || Number.isNaN(at.getTime())) return null;
  return { at, id };
}

/** Rows fetched with `limit + 1`: trims the extra row and turns it into the next cursor. */
export function toPage<T extends { id: string }>(rows: T[], limit: number, at: (row: T) => Date): Page<T> {
  if (rows.length <= limit) return { rows, next: null };
  const page = rows.slice(0, limit);
  const last = page[page.length - 1]!;
  return { rows: page, next: encodeCursor(at(last), last.id) };
}
