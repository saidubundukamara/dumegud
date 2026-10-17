import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// Optimistic auth redirects only (see authConfig.callbacks.authorized). Never real
// authorization: every page and Server Action re-checks the session through server/dal/session.ts.
// Security headers and CSP live in next.config.ts.
const { auth } = NextAuth(authConfig);

export default auth;

// Only the signed-in areas: running Auth.js on public pages could add Set-Cookie headers that
// stop the CDN caching them.
export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
