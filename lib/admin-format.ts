// Display helpers for the admin console: one date style, readable statuses, and the tone each
// status shows in. Sierra Leone keeps GMT all year, so Freetown time is UTC.

export type Tone = "success" | "warning" | "danger" | "neutral" | "primary";

const DATE_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Freetown", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const DATE = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Freetown", day: "numeric", month: "short", year: "numeric" });
const TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Freetown", hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** "24 Oct 2026, 14:05" */
export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "Not yet";
  return DATE_TIME.format(new Date(d));
}

/** "24 Oct 2026" */
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "Not yet";
  return DATE.format(new Date(d));
}

/** "14:05:09" (timelines, where the day is already shown). */
export function formatTime(d: Date | string): string {
  return TIME.format(new Date(d));
}

/** "just now", "12 min ago", "3 h ago", "5 days ago", then the date. */
export function formatRelative(d: Date | string | null | undefined, now: Date = new Date()): string {
  if (!d) return "Never";
  const date = new Date(d);
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  if (seconds < 0) return `in ${formatDuration(-seconds)}`;
  if (seconds < 45) return "just now";
  if (seconds < 30 * 86_400) return `${formatDuration(seconds)} ago`;
  return formatDate(date);
}

function formatDuration(seconds: number): string {
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h`;
  const days = Math.round(seconds / 86_400);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** "Chrome on macOS" from a user agent (show the full string in a title). */
export function device(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}

/** First 8 characters of an id, for display next to a copy button. */
export const shortId = (id: string) => id.slice(0, 8);

/** "under_review" / "retry-transfers" → "Under review" / "Retry transfers", "id_verified" → "Id verified" (unless overridden below). */
export function humanize(value: string | null | undefined): string {
  if (!value) return "None";
  if (value in WORDS) return WORDS[value]!;
  const words = value
    .replace(/[._-]/g, " ")
    .trim()
    .replace(/\b(totp|kyc|id|ip|csv|url)\b/gi, (w) => ACRONYMS[w.toLowerCase()]!);
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const ACRONYMS: Record<string, string> = { totp: "2FA", kyc: "KYC", id: "ID", ip: "IP", csv: "CSV", url: "URL" };

const WORDS: Record<string, string> = {
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  youtube: "YouTube",
  id_verified: "ID verified",
  needs_more_info: "Needs more info",
  pending_review: "In review",
  in_review: "In review",
  under_review: "Under review",
  info_requested: "Info requested",
  awaiting_approval: "Needs 2nd approval",
  m17: "Orange Money",
  m18: "AfriMoney",
  creator_payable: "Creator payable",
  kyc: "KYC",
  per_contribution: "Per contribution",
  supporter_to_creator: "One supporter to one creator",
  supporter_global: "One supporter, all creators",
  velocity_count: "Checkouts per network",
};

const TONES: Record<string, Tone> = {
  // payments
  succeeded: "success",
  pending: "warning",
  created: "neutral",
  failed: "danger",
  canceled: "neutral",
  expired: "neutral",
  reversed: "danger",
  under_review: "warning",
  // transfers & payouts
  completed: "success",
  processing: "warning",
  requested: "warning",
  in_review: "warning",
  not_started: "neutral",
  // kyc
  approved: "success",
  rejected: "danger",
  needs_more_info: "warning",
  // products & pages
  published: "success",
  pending_review: "warning",
  draft: "neutral",
  unpublished: "neutral",
  suspended: "danger",
  // accounts
  active: "success",
  restricted: "warning",
  closed: "neutral",
  disabled: "neutral",
  // risk
  open: "warning",
  dismissed: "neutral",
  escalated: "primary",
  actioned: "success",
  info_requested: "warning",
  awaiting_approval: "primary",
  low: "neutral",
  medium: "warning",
  high: "danger",
  // webhooks & jobs
  processed: "success",
  ignored: "neutral",
  dead: "danger",
  running: "warning",
  skipped: "neutral",
};

export function toneOf(status: string | null | undefined): Tone {
  return (status && TONES[status]) || "neutral";
}
