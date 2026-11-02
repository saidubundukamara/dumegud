// Social link rules. Isomorphic. URLs are stored and rendered as links but never fetched (no SSRF).
// Known platforms must point at that platform's host, so a link labelled "Instagram" can't
// lead somewhere else.

export const SOCIAL_PLATFORMS = [
  "website",
  "instagram",
  "tiktok",
  "youtube",
  "facebook",
  "x",
  "linkedin",
  "spotify",
  "soundcloud",
] as const;

export type Platform = (typeof SOCIAL_PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  website: "Website",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  facebook: "Facebook",
  x: "X (Twitter)",
  linkedin: "LinkedIn",
  spotify: "Spotify",
  soundcloud: "SoundCloud",
};

const PLATFORM_HOSTS: Record<Exclude<Platform, "website">, readonly string[]> = {
  instagram: ["instagram.com"],
  tiktok: ["tiktok.com"],
  youtube: ["youtube.com", "youtu.be"],
  facebook: ["facebook.com", "fb.com"],
  x: ["x.com", "twitter.com"],
  linkedin: ["linkedin.com"],
  spotify: ["spotify.com"],
  soundcloud: ["soundcloud.com"],
};

export const MAX_SOCIAL_LINKS = 6;

/** Normalised https URL, or an error message. Bare "example.com" gets https:// added. */
export function parseSocialUrl(platform: Platform, input: string): { url: string } | { error: string } {
  const raw = input.trim();
  if (!raw) return { error: "Enter a link." };
  if (raw.length > 300) return { error: "That link is too long." };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { error: "Enter a valid link." };
  }
  if (url.protocol !== "https:") return { error: "Links must start with https://" };
  if (url.username || url.password) return { error: "Enter a valid link." };
  if (!url.hostname.includes(".")) return { error: "Enter a valid link." };

  if (platform !== "website") {
    const host = url.hostname.toLowerCase();
    const ok = PLATFORM_HOSTS[platform].some((h) => host === h || host.endsWith(`.${h}`));
    if (!ok) return { error: `That isn't a ${PLATFORM_LABELS[platform]} link.` };
  }
  return { url: url.toString() };
}

// ── Usernames ───────────────────────────────────────────────────────────────────
// Creators know their username, not their profile URL. For these platforms we take the username
// (with or without @) and build the link; a pasted link still works. Spotify (opaque artist IDs)
// and websites stay link-only.

type ProfileRule = { prefix: string; host: string; pattern: RegExp; hint: string };

const PROFILE_RULES: Partial<Record<Platform, ProfileRule>> = {
  instagram: { host: "www.instagram.com", prefix: "/", pattern: /^[a-z0-9._]{1,30}$/i, hint: "up to 30 letters, numbers, dots or underscores" },
  tiktok: { host: "www.tiktok.com", prefix: "/@", pattern: /^[a-z0-9._]{2,24}$/i, hint: "2–24 letters, numbers, dots or underscores" },
  youtube: { host: "www.youtube.com", prefix: "/@", pattern: /^[a-z0-9._-]{3,30}$/i, hint: "3–30 letters, numbers, dots, dashes or underscores" },
  x: { host: "x.com", prefix: "/", pattern: /^[a-z0-9_]{1,15}$/i, hint: "up to 15 letters, numbers or underscores" },
  facebook: { host: "www.facebook.com", prefix: "/", pattern: /^[a-z0-9.]{5,50}$/i, hint: "5–50 letters, numbers or dots" },
  soundcloud: { host: "soundcloud.com", prefix: "/", pattern: /^[a-z0-9_-]{3,25}$/i, hint: "3–25 letters, numbers, dashes or underscores" },
  linkedin: { host: "www.linkedin.com", prefix: "/in/", pattern: /^[a-z0-9-]{3,100}$/i, hint: "letters, numbers or dashes" },
};

/** True when the platform takes a username (we build the link). */
export function takesUsername(platform: Platform): boolean {
  return platform in PROFILE_RULES;
}

function looksLikeLink(platform: Platform, raw: string): boolean {
  if (/[/:]/.test(raw)) return true;
  // "instagram.com" or "www.tiktok.com" typed without a path.
  const host = raw.toLowerCase().replace(/^www\.|^m\./, "");
  return platform !== "website" && PLATFORM_HOSTS[platform].includes(host);
}

/**
 * What the creator typed (a username for most platforms, or a link) → normalised https URL.
 * Links go through `parseSocialUrl`, so the platform host check still applies.
 */
export function parseSocialInput(platform: Platform, input: string): { url: string } | { error: string } {
  const raw = input.trim();
  const rule = PROFILE_RULES[platform];
  if (!rule || looksLikeLink(platform, raw)) return parseSocialUrl(platform, raw);

  const username = raw.replace(/^@+/, "");
  if (!username) return { error: `Enter your ${PLATFORM_LABELS[platform]} username.` };
  if (!rule.pattern.test(username)) {
    return { error: `That doesn't look like a ${PLATFORM_LABELS[platform]} username (${rule.hint}).` };
  }
  return { url: `https://${rule.host}${rule.prefix}${username}` };
}

/** The username in a plain profile link (for the edit form), or null to show the link as it is. */
export function usernameFromUrl(platform: Platform, url: string): string | null {
  const rule = PROFILE_RULES[platform];
  if (!rule || platform === "website") return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.search || parsed.hash) return null;
  const host = parsed.hostname.toLowerCase();
  if (!PLATFORM_HOSTS[platform].some((h) => host === h || host.endsWith(`.${h}`))) return null;
  const path = parsed.pathname.replace(/\/$/, "");
  if (!path.startsWith(rule.prefix)) return null;
  const username = path.slice(rule.prefix.length);
  return rule.pattern.test(username) ? username : null;
}
