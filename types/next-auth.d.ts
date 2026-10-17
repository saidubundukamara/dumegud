import type { DefaultSession } from "next-auth";
import type { Role } from "@/server/db/schema/auth";

// Claims we add to Auth.js users, sessions and JWTs (see auth.config.ts callbacks).

declare module "next-auth" {
  interface User {
    role?: Role;
    sessionVersion?: number;
  }
  interface Session {
    user: { id: string; role?: Role; sv?: number } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string;
    role?: Role;
    sv?: number;
  }
}
