// Money helpers, safe for both server and client. All amounts are integer MINOR units of SLE
// (1 Le = 100 minor units). Never use floats for money; never Math.round fees (see
// implementation.md §3). Fee math lands in lib/fees.ts in Phase 4.

export const CURRENCY = "SLE" as const;
export const MINOR_PER_MAJOR = 100;

/** An integer amount in minor units. */
export type Minor = number;

export function isMinor(value: unknown): value is Minor {
  return typeof value === "number" && Number.isSafeInteger(value);
}

export function assertMinor(value: unknown, label = "amount"): asserts value is Minor {
  if (!isMinor(value)) throw new TypeError(`${label} must be an integer number of minor units, got ${String(value)}`);
}

/**
 * Parse a user-entered major amount ("50", "50.5", "1,250.75") into minor units without going
 * through floating point. Returns null for anything that isn't a valid non-negative amount
 * with at most 2 decimal places.
 */
export function parseMajorToMinor(input: string): Minor | null {
  const cleaned = input.trim().replace(/,/g, "");
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const minor = whole * MINOR_PER_MAJOR + fraction;
  return Number.isSafeInteger(minor) ? minor : null;
}

/** Floor of `amount × bps / 10_000` using integer math only. */
export function bpsOf(amount: Minor, bps: number): Minor {
  assertMinor(amount);
  if (!Number.isInteger(bps) || bps < 0) throw new RangeError(`bps must be a non-negative integer, got ${bps}`);
  return Math.floor((amount * bps) / 10_000);
}

const formatter = new Intl.NumberFormat("en-SL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Like formatSLE but drops ".00" on whole amounts: 5000 → "Le 50", 125075 → "Le 1,250.75". */
export function formatSLECompact(amount: Minor): string {
  const full = formatSLE(amount);
  return full.endsWith(".00") ? full.slice(0, -3) : full;
}

/** Format minor units for display, e.g. 125075 → "Le 1,250.75". */
export function formatSLE(amount: Minor): string {
  assertMinor(amount);
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const major = Math.trunc(abs / MINOR_PER_MAJOR);
  const minor = abs % MINOR_PER_MAJOR;
  // Format the parts separately so we never divide into a float.
  const [majorText] = formatter.format(major).split(".");
  return `${sign}Le ${majorText}.${String(minor).padStart(2, "0")}`;
}
