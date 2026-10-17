import "server-only";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/auth";
import type { Role } from "@/server/db/schema";
import type { Actor } from "@/server/services/actor";
import { repos } from "@/server/services";

// Data Access Layer for authentication. The JWT says who the caller claims to be; this checks
// the database on every request so suspension, role changes and "sign out everywhere"
// (sessionVersion bumps) take effect immediately. Layouts don't gate; every page, Server
// Action and Route Handler calls one of these.

export type VerifiedSession = { actor: Actor };

export const getSession = cache(async (): Promise<VerifiedSession | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  const sv = session?.user?.sv;
  if (!userId || typeof sv !== "number") return null;

  const user = await repos.users.findAuthState(userId);
  if (!user || user.status === "suspended" || user.status === "closed" || user.sessionVersion !== sv) {
    return null;
  }
  return {
    actor: { userId: user.id, role: user.role, status: user.status, emailVerified: user.emailVerified !== null },
  };
});

/** Pages and actions that need a signed-in user. */
export async function verifySession(): Promise<VerifiedSession> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Renders the 403 page (forbidden.tsx) for users without one of `roles`. */
export async function requireRole(...roles: Role[]): Promise<VerifiedSession> {
  const session = await verifySession();
  if (!roles.includes(session.actor.role)) forbidden();
  return session;
}
