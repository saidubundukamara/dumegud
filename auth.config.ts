import type { NextAuthConfig } from "next-auth";

// Provider-agnostic Auth.js config shared with proxy.ts. Keep it free of DB, argon2 and env
// validation imports: the proxy runs it on every matched request.

const PROTECTED_PREFIXES = ["/dashboard", "/admin"];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export const authConfig = {
  pages: { signIn: "/login", error: "/login" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7, updateAge: 60 * 60 },
  providers: [],
  callbacks: {
    /**
     * Optimistic check only (JWT present). Real authorization (sessionVersion, status, role)
     * happens in the DAL on every page and action. Staff-only pages render 403 from the DAL.
     */
    authorized({ auth, request }) {
      const { pathname, search } = request.nextUrl;
      if (!isProtected(pathname) || auth?.user?.id) return true;
      const login = new URL("/login", request.nextUrl);
      login.searchParams.set("next", `${pathname}${search}`);
      return Response.redirect(login);
    },
    jwt({ token, user }) {
      if (user?.id) {
        token.uid = user.id;
        token.role = user.role;
        token.sv = user.sessionVersion;
      }
      return token;
    },
    session({ session, token }) {
      if (token.uid) session.user.id = token.uid;
      if (token.role) session.user.role = token.role;
      if (typeof token.sv === "number") session.user.sv = token.sv;
      return session;
    },
  },
} satisfies NextAuthConfig;
