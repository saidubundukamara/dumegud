// Where a supporter came from. Isomorphic and pure. In-app browsers (TikTok, Instagram,
// Facebook) usually send no referrer, so the creator's per-platform share link (`?via=tiktok`)
// is the reliable signal; the in-app user agent and the referrer are fallbacks. Attribution only:
// never used for anything that matters to money or access.

export const TRAFFIC_SOURCES = ["tiktok", "instagram", "facebook", "whatsapp", "x", "youtube", "direct", "other"] as const;

export type TrafficSource = (typeof TRAFFIC_SOURCES)[number];

export const TRAFFIC_SOURCE_LABELS: Record<TrafficSource, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  x: "X (Twitter)",
  youtube: "YouTube",
  direct: "Direct / unknown",
  other: "Other sites",
};

/** Sources a creator can make a share link for (`?via=`). */
export const SHARE_SOURCES = ["tiktok", "instagram", "facebook", "whatsapp", "x", "youtube"] as const satisfies readonly TrafficSource[];

export function isTrafficSource(value: unknown): value is TrafficSource {
  return typeof value === "string" && (TRAFFIC_SOURCES as readonly string[]).includes(value);
}

const UA_RULES: ReadonlyArray<[RegExp, TrafficSource]> = [
  [/musical_ly|BytedanceWebview|TikTok/i, "tiktok"],
  [/Instagram/i, "instagram"],
  [/FBAN|FBAV|FB_IAB|FBIOS/i, "facebook"],
  [/WhatsApp/i, "whatsapp"],
  [/Twitter/i, "x"],
];

const REFERRER_HOSTS: ReadonlyArray<[string, TrafficSource]> = [
  ["tiktok.com", "tiktok"],
  ["instagram.com", "instagram"],
  ["facebook.com", "facebook"],
  ["fb.com", "facebook"],
  ["whatsapp.com", "whatsapp"],
  ["wa.me", "whatsapp"],
  ["t.co", "x"],
  ["x.com", "x"],
  ["twitter.com", "x"],
  ["youtube.com", "youtube"],
  ["youtu.be", "youtube"],
];

/**
 * Best guess at the source: `?via=` wins, then the in-app browser, then the referrer host.
 * `ownHost` lets same-site navigation count as direct.
 */
export function detectSource(input: { via?: string | null; userAgent?: string | null; referrer?: string | null; ownHost?: string }): TrafficSource {
  const via = input.via?.trim().toLowerCase();
  if (isTrafficSource(via) && via !== "direct" && via !== "other") return via;

  if (input.userAgent) {
    for (const [pattern, source] of UA_RULES) if (pattern.test(input.userAgent)) return source;
  }

  if (input.referrer) {
    let host: string;
    try {
      host = new URL(input.referrer).hostname.toLowerCase();
    } catch {
      return "direct";
    }
    if (input.ownHost && host === input.ownHost.toLowerCase()) return "direct";
    for (const [h, source] of REFERRER_HOSTS) if (host === h || host.endsWith(`.${h}`)) return source;
    return "other";
  }
  return "direct";
}
