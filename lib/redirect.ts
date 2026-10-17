// Open-redirect guard for `next` / `callbackUrl` values (implementation.md §4). Safe for client
// and server.

const BASE = "http://dumegud.invalid";

/**
 * Return `value` if it is a same-origin relative path, otherwise `fallback`. Rejects absolute
 * URLs, protocol-relative `//host`, backslash tricks (`/\host`) and control characters.
 */
export function safeRedirectPath(value: unknown, fallback = "/dashboard"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f]/.test(value)) return fallback;
  try {
    const url = new URL(value, BASE);
    if (url.origin !== BASE) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
