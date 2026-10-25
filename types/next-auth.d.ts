import type { DefaultSession } from "next-auth";

// Claims we add to Auth.js users, sessions and JWTs (see auth.config.ts callbacks). Auth.js is
// for creators only; admins sign in on the admin subdomain with their own session.

declare module "next-auth" {
  interface User {
    sessionVersion?: number;
  }
  interface Session {
    user: { id: string; sv?: number } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string;
    sv?: number;
  }
}
