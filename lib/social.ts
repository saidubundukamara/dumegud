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
