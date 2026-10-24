import { formatSLECompact, type Minor } from "./money";
import { TRAFFIC_SOURCE_LABELS, type TrafficSource } from "./traffic-source";

// A creator's month on DuMeGud. Pure and isomorphic. Months are calendar months in Freetown
// time, which is GMT all year, so UTC month boundaries are exact.

/** "2026-09" */
export type MonthKey = string;

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** The frozen numbers behind one recap (stored as jsonb; keep additions optional). */
export type RecapStats = {
  month: MonthKey;
  /** Distinct people who sent a gift (grouped by mobile-money payer). */
  supporters: number;
  /** Of those, people who had never supported this creator before this month. */
  newSupporters: number;
  gifts: number;
  productsSold: number;
  /** What reached the creator after fees, gifts and sales together. */
  receivedNetMinor: Minor;
  giftsNetMinor: Minor;
  salesNetMinor: Minor;
  /** Where most gifts and sales came from, when any came through a known app. */
  topSource: TrafficSource | null;
  /** More received than in any earlier month (never true for a creator's first month). */
  bestMonth: boolean;
};

export function isMonthKey(value: unknown): value is MonthKey {
  return typeof value === "string" && MONTH_RE.test(value);
}

export function monthKey(d: Date): MonthKey {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** [start, end) of the month. */
export function monthRange(month: MonthKey): { from: Date; to: Date } {
  const m = MONTH_RE.exec(month);
  if (!m) throw new RangeError(`not a month: ${month}`);
  const year = Number(m[1]);
  const index = Number(m[2]) - 1;
  return { from: new Date(Date.UTC(year, index, 1)), to: new Date(Date.UTC(year, index + 1, 1)) };
}

export function previousMonth(month: MonthKey): MonthKey {
  return monthKey(new Date(monthRange(month).from.getTime() - 1));
}

const monthName = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/** "September" */
export function formatMonth(month: MonthKey): string {
  return monthName.format(monthRange(month).from);
}

/** "September 2026" */
export function formatMonthYear(month: MonthKey): string {
  return monthYear.format(monthRange(month).from);
}

export type RecapLine = { key: "supporters" | "received" | "sold" | "new" | "source"; value: string; label: string };

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * The lines worth showing, most important first. Anything that is zero is left out, and with
 * `showAmounts` off nothing says how much money came in.
 */
export function recapLines(stats: RecapStats, { showAmounts }: { showAmounts: boolean }): RecapLine[] {
  const lines: RecapLine[] = [];
  if (stats.supporters) {
    lines.push({ key: "supporters", value: String(stats.supporters), label: plural(stats.supporters, "person supported me", "people supported me") });
  }
  if (showAmounts && stats.receivedNetMinor > 0) {
    lines.push({ key: "received", value: formatSLECompact(stats.receivedNetMinor), label: "came in from my fans" });
  }
  if (stats.productsSold) {
    lines.push({ key: "sold", value: String(stats.productsSold), label: plural(stats.productsSold, "product sold", "products sold") });
  }
  if (stats.newSupporters && stats.newSupporters !== stats.supporters) {
    lines.push({ key: "new", value: String(stats.newSupporters), label: plural(stats.newSupporters, "new supporter", "new supporters") });
  }
  if (stats.topSource && stats.topSource !== "direct" && stats.topSource !== "other") {
    lines.push({ key: "source", value: TRAFFIC_SOURCE_LABELS[stats.topSource], label: "is where most of you found me" });
  }
  return lines;
}

/** The caption to paste under the card. */
export function recapCaption(stats: RecapStats, opts: { showAmounts: boolean; pageUrl: string }): string {
  const month = formatMonth(stats.month);
  const people = stats.supporters ? `${stats.supporters} ${plural(stats.supporters, "person", "people")} supported me in ${month}` : `${month} on DuMeGud`;
  const money = opts.showAmounts && stats.receivedNetMinor > 0 ? ` (${formatSLECompact(stats.receivedNetMinor)} in total)` : "";
  const sold = stats.productsSold ? ` and ${stats.productsSold} of you bought something I made` : "";
  const best = stats.bestMonth ? " My best month yet." : "";
  return `${people}${money}${sold}.${best} Thank you all! Want to be part of next month? ${opts.pageUrl}`;
}
