import NextAuth from "next-auth";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { isAdminHost } from "./lib/admin-host";
import { authConfig } from "./auth.config";

// Optimistic auth redirects only (see authConfig.callbacks.authorized). Never real
// authorization: every page and Server Action re-checks the session through server/dal/session.ts
// (creators) or server/dal/admin-session.ts (admins). Security headers and CSP live in
// next.config.ts, and so do the admin-host rewrites (`admin.<host>/x` → `/admin/x`), which run
// after this.
const { auth } = NextAuth(authConfig);
const creatorAuth = auth as unknown as (request: NextRequest, event: NextFetchEvent) => Promise<Response>;

const notFound = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;
  const adminHost = isAdminHost(request.headers.get("host"));
  // The internal admin segment is never addressed directly, on any host: on the main site the
  // admin doesn't exist, and on the admin host its pages live at the root.
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return notFound();
  if (pathname.startsWith("/api/admin/")) return adminHost ? NextResponse.next() : notFound();
  if (adminHost) return pathname === "/dashboard" || pathname.startsWith("/dashboard/") ? notFound() : NextResponse.next();
  // A Server Action that calls redirect() has Next fetch the target from the server's own origin,
  // which drops the admin Host (and so the admin-host rewrites): an admin action redirecting to
  // /login would get the creators' sign-in. Refusing that fetch makes Next send the redirect to
  // the browser instead, which navigates on the admin host. A spoofed header only earns a 404.
  if (isAdminHost(request.headers.get("x-forwarded-host"))) return notFound();
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) return creatorAuth(request, event);
  return NextResponse.next();
}

// Only these paths: running Auth.js on public pages could add Set-Cookie headers that stop the
// CDN caching them. The last entry only matches requests forwarded for the admin host (see above).
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin",
    "/admin/:path*",
    "/api/admin/:path*",
    { source: "/((?!_next/|favicon\\.ico$).*)", has: [{ type: "header", key: "x-forwarded-host", value: "admin\\..+" }] },
  ],
};
