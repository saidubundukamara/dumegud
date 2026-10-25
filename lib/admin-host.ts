import type { Route } from "next";

// The admin lives on its own host (admin.dumegud.…, admin.localhost:3000 in dev). Its pages are
// files under app/(admin)/admin; next.config.ts rewrites `admin.<host>/x` to `/admin/x`, and the
// proxy 404s `/admin/*` on every host so the internal paths are never reachable directly.
// No server-only import: next.config.ts and client components read this too.

const FALLBACK_APP_URL = "http://localhost:3000";

type Env = { readonly [key: string]: string | undefined };

/** ADMIN_BASE_URL, or `admin.` + the APP_BASE_URL host (www. dropped). */
export function adminBaseUrl(env: Env = process.env): string {
  if (env.ADMIN_BASE_URL) return env.ADMIN_BASE_URL.replace(/\/$/, "");
  let app: URL;
  try {
    app = new URL(env.APP_BASE_URL || FALLBACK_APP_URL);
  } catch {
    app = new URL(FALLBACK_APP_URL);
  }
  app.hostname = `admin.${app.hostname.replace(/^www\./, "")}`;
  return app.origin;
}

/** The admin hostname without port, as next.config `has: [{ type: "host" }]` matches it. */
export function adminHostname(env?: Env): string {
  return new URL(adminBaseUrl(env)).hostname.toLowerCase();
}

/** True for a Host header (port optional) that is the admin host. */
export function isAdminHost(host: string | null | undefined, env?: Env): boolean {
  return !!host && host.split(":", 1)[0]!.toLowerCase() === adminHostname(env);
}

/**
 * An internal admin route (`/admin/creators`, typed against the real files) → the path the
 * browser uses on the admin host (`/creators`). Use for every admin Link, redirect and form.
 */
export function adminHref<T extends string>(path: Route<T>): Route {
  const external = path.replace(/^\/admin(?=\/|\?|$)/, "");
  return (external.startsWith("/") ? external : `/${external}`) as Route;
}
