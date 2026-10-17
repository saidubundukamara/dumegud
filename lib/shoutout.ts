// Supporter shout-outs: handle rules and the thank-you caption. Isomorphic and pure.
// Handles are self-declared (never verified), so the creator reviews every post before sharing it.

import type { TrafficSource } from "./traffic-source";

export const SHOUTOUT_PLATFORMS = ["tiktok", "instagram", "facebook", "x"] as const;

export type ShoutoutPlatform = (typeof SHOUTOUT_PLATFORMS)[number];

export const SHOUTOUT_PLATFORM_LABELS: Record<ShoutoutPlatform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X",
};

export function isShoutoutPlatform(value: unknown): value is ShoutoutPlatform {
  return typeof value === "string" && (SHOUTOUT_PLATFORMS as readonly string[]).includes(value);
}

/** The platform to suggest for a visitor: where they came from, else TikTok. */
export function defaultShoutoutPlatform(source: TrafficSource | null | undefined): ShoutoutPlatform {
  return isShoutoutPlatform(source) ? source : "tiktok";
}

const HANDLE_RULES: Record<ShoutoutPlatform, { pattern: RegExp; hint: string }> = {
  tiktok: { pattern: /^[a-z0-9._]{2,24}$/, hint: "2–24 letters, numbers, dots or underscores" },
  instagram: { pattern: /^[a-z0-9._]{1,30}$/, hint: "up to 30 letters, numbers, dots or underscores" },
  facebook: { pattern: /^[a-z0-9.]{5,50}$/, hint: "5–50 letters, numbers or dots" },
  x: { pattern: /^[a-z0-9_]{1,15}$/, hint: "up to 15 letters, numbers or underscores" },
};

export const SHOUTOUT_HANDLE_MAX = 50;

/** Lower-cased handle without the leading @ (or a profile URL's last segment), or an error. */
export function parseShoutoutHandle(platform: ShoutoutPlatform, input: string): { handle: string } | { error: string } {
  let raw = input.trim();
  // People paste their profile link: keep the last path segment.
  const fromUrl = /^(?:https?:\/\/)?(?:www\.|m\.)?[a-z0-9.-]+\.[a-z]{2,}\/@?([^/?#]+)/i.exec(raw);
  if (fromUrl) raw = fromUrl[1];
  const handle = raw.replace(/^@+/, "").toLowerCase();
  if (!handle) return { error: "Enter your username." };
  const rule = HANDLE_RULES[platform];
  if (!rule.pattern.test(handle)) {
    return { error: `That doesn't look like a ${SHOUTOUT_PLATFORM_LABELS[platform]} username (${rule.hint}).` };
  }
  return { handle };
}

// ── Caption ─────────────────────────────────────────────────────────────────────

export type ShoutoutPerson = {
  name: string | null;
  platform: ShoutoutPlatform | null;
  handle: string | null;
};

export const CAPTION_STYLES = ["warm", "short"] as const;
export type CaptionStyle = (typeof CAPTION_STYLES)[number];

export const CAPTION_STYLE_LABELS: Record<CaptionStyle, string> = {
  warm: "Warm",
  short: "Short",
};

/**
 * How a supporter is written in a post on `platform`: an @mention only works on its own network,
 * so other supporters appear by name (or `handle (TikTok)` when they gave no name).
 */
export function mentionFor(person: ShoutoutPerson, platform: ShoutoutPlatform): string | null {
  if (person.handle && person.platform === platform) return `@${person.handle}`;
  if (person.name) return person.name;
  if (person.handle && person.platform) return `${person.handle} (${SHOUTOUT_PLATFORM_LABELS[person.platform]})`;
  return null;
}

/** Mentions for the post, deduplicated, in order. */
export function mentionList(people: readonly ShoutoutPerson[], platform: ShoutoutPlatform): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const person of people) {
    const mention = mentionFor(person, platform);
    if (!mention || seen.has(mention.toLowerCase())) continue;
    seen.add(mention.toLowerCase());
    out.push(mention);
  }
  return out;
}

const PERIOD_WORDS = { week: "this week", month: "this month", since_last: "lately" } as const;
export type ShoutoutPeriod = keyof typeof PERIOD_WORDS;

export function buildCaption(input: {
  style: CaptionStyle;
  platform: ShoutoutPlatform;
  period: ShoutoutPeriod;
  people: readonly ShoutoutPerson[];
  /** Top supporters, already ranked. Never amounts. */
  top?: readonly ShoutoutPerson[];
  /** The creator's page, e.g. "dumegud.com/aminata". `?via=` is added for attribution. */
  pageUrl: string;
}): string {
  const mentions = mentionList(input.people, input.platform);
  const top = input.top?.length ? mentionList(input.top, input.platform) : [];
  const when = PERIOD_WORDS[input.period];
  const link = `${input.pageUrl}?via=${input.platform}`;
  const n = mentions.length;

  const lines: string[] = [];
  switch (input.style) {
    case "warm":
      lines.push(`Thank you to everyone who supported me ${when}! 🙏🏾`, "");
      lines.push(n === 1 ? "Big love to:" : `Big love to all ${n} of you:`);
      break;
    case "short":
      lines.push(`Thank you ${when} 🙏🏾`);
      break;
  }
  lines.push(mentions.join(" "));

  if (top.length) {
    lines.push("", "Top supporters 🏆");
    top.forEach((t, i) => lines.push(`${["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`} ${t}`));
  }

  lines.push("", `Want a shout-out next time? Support me here 👉🏾 ${link}`);
  return lines.join("\n");
}
