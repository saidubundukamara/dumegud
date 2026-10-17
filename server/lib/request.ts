import "server-only";

/**
 * Best-effort client IP. On Vercel `x-forwarded-for` is set by the platform edge (the first
 * entry is the client); it is only trustworthy behind a proxy that overwrites it, so use the
 * result for rate limiting and risk signals, never for authorization.
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/** IP + user agent for auth_events / rate limiting. */
export function getRequestContext(headers: Headers): { ip: string; userAgent: string | null } {
  return { ip: getClientIp(headers), userAgent: headers.get("user-agent")?.slice(0, 256) ?? null };
}
