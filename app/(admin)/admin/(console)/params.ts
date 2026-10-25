import { isUuid } from "@/lib/uuid";

// Reading search params on console list pages. Anything unexpected is ignored, never an error.

type Raw = string | string[] | undefined;

export const str = (v: Raw): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export function oneOf<T extends string>(v: Raw, allowed: readonly T[]): T | undefined {
  const s = str(v);
  return s && (allowed as readonly string[]).includes(s) ? (s as T) : undefined;
}

export const uuidParam = (v: Raw): string | undefined => (isUuid(str(v)) ? str(v) : undefined);

/** `YYYY-MM-DD` → midnight UTC (Freetown time). `endOfDay` gives the next midnight, for "to". */
export function dateParam(v: Raw, endOfDay = false): Date | undefined {
  const s = str(v);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return undefined;
  return endOfDay ? new Date(d.getTime() + 86_400_000) : d;
}

/** The params a list keeps across pages (strings only, cursor included). */
export function keep(sp: Record<string, Raw>, keys: readonly string[]): Record<string, string | undefined> {
  return Object.fromEntries(keys.map((k) => [k, str(sp[k])]));
}
