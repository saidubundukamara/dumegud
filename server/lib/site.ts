import "server-only";

// Read straight from process.env, not getEnv(): metadata, robots and the sitemap are evaluated at
// build time, where the full env (database, Monime, R2 secrets) isn't present and getEnv() throws.

const FALLBACK = "http://localhost:3000";

/** The canonical origin, e.g. https://dumegud.com. Every absolute URL in metadata hangs off it. */
export function siteUrl(): URL {
  try {
    return new URL(process.env.APP_BASE_URL || FALLBACK);
  } catch {
    return new URL(FALLBACK);
  }
}

/** `/kotor_saedu` → `https://dumegud.com/kotor_saedu` */
export function absoluteUrl(path: string): string {
  return new URL(path, siteUrl()).toString();
}

/**
 * Only the production site may be indexed. Vercel previews, local dev and any localhost origin
 * tell crawlers to stay away, so test pages never compete with the real ones in search.
 */
export function isIndexable(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv && vercelEnv !== "production") return false;
  if (process.env.NODE_ENV !== "production") return false;
  const host = siteUrl().hostname;
  return host !== "localhost" && host !== "127.0.0.1" && !host.endsWith(".localhost");
}
