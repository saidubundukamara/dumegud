import "server-only";
import { ForbiddenError } from "./errors";

/**
 * CSRF guard for state-changing Route Handlers. (Server Actions get an equivalent Origin/Host
 * check from Next.js automatically.) Not used on the Monime webhook (HMAC-signed) or cron
 * routes (CRON_SECRET) — those are called server-to-server.
 *
 * Unlike Next's Server Action check, a missing Origin is rejected: browsers always send it on
 * cross-origin and same-origin POST/PUT/PATCH/DELETE fetches, so its absence means a non-browser
 * caller, which our cookie-authenticated mutation routes don't serve.
 */
export function assertSameOrigin(request: Request): void {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") throw new ForbiddenError("Cross-site request blocked.");

  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) throw new ForbiddenError("Cross-site request blocked.");

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ForbiddenError("Cross-site request blocked.");
  }
  if (originHost !== host) throw new ForbiddenError("Cross-site request blocked.");
}
