// Date-of-birth rules shared by sign-up and KYC. Dates are calendar dates (`YYYY-MM-DD`) and
// "today" is taken in UTC, which is Sierra Leone's time zone (Africa/Freetown, no DST).

export const MIN_AGE = 18;
const MAX_AGE = 120;

export type CalendarDate = { year: number; month: number; day: number };

/** Strict `YYYY-MM-DD`. Returns null for anything else, including dates like 2000-02-31. */
export function parseIsoDate(value: string): CalendarDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return { year, month, day };
}

/** Whole years between `dob` and `today`. Someone born on 29 February turns a year older on 1 March. */
export function ageOn(dob: CalendarDate, today: Date): number {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth() + 1;
  const d = today.getUTCDate();
  const hadBirthday = m > dob.month || (m === dob.month && d >= dob.day);
  return y - dob.year - (hadBirthday ? 0 : 1);
}

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/**
 * Join the day, month and year boxes into `YYYY-MM-DD`. All empty → "" (missing); anything that
 * isn't a 4-digit year and numeric day/month comes back as-is so validation calls it invalid.
 */
export function isoFromParts(day: string, month: string, year: string): string {
  const [d, m, y] = [day.trim(), month.trim(), year.trim()];
  if (!d && !m && !y) return "";
  if (!/^\d{1,2}$/.test(d) || !/^\d{1,2}$/.test(m) || !/^\d{4}$/.test(y)) return `${y}-${m}-${d}`;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/** "14 May 2010", for repeating a date back to someone. */
export function formatCalendarDate(dob: CalendarDate): string {
  return `${dob.day} ${MONTHS[dob.month - 1]} ${dob.year}`;
}

export type DobCheck = "ok" | "invalid" | "under_age";

/** Valid, not in the future, under 120, and at least 18 today. */
export function checkDateOfBirth(value: string, today: Date = new Date()): DobCheck {
  const dob = parseIsoDate(value);
  if (!dob) return "invalid";
  const age = ageOn(dob, today);
  if (age < 0 || age >= MAX_AGE || Date.UTC(dob.year, dob.month - 1, dob.day) > today.getTime()) return "invalid";
  return age >= MIN_AGE ? "ok" : "under_age";
}
