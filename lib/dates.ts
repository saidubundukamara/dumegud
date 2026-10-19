// Dates as creators read them: Sierra Leone time (GMT all year), day before month, no "UTC".

const TIME_ZONE = "Africa/Freetown";

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TIME_ZONE });
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: TIME_ZONE,
});

/** 18 Oct 2026 */
export function formatDate(d: Date): string {
  return dateFormat.format(d);
}

/** 18 Oct 2026 at 14:05 */
export function formatDateTime(d: Date): string {
  const parts = dateTimeFormat.formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")} ${get("month")} ${get("year")} at ${get("hour")}:${get("minute")}`;
}

/** "Just now", "5 min ago", "3 hours ago", "Yesterday", then the date. */
export function formatRelative(d: Date, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  if (hours < 48) return "Yesterday";
  return formatDate(d);
}
