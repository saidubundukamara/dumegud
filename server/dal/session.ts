import "server-only";
import { forbidden, redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { auth } from "@/auth";
import type { Role } from "@/server/db/schema";
import type { Actor } from "@/server/services/actor";
import { repos } from "@/server/services";
import { requireStepUp } from "./step-up";

// Data Access Layer for authentication. The JWT says who the caller claims to be; this checks
// the database on every request so suspension, role changes and "sign out everywhere"
// (sessionVersion bumps) take effect immediately. Layouts don't gate; every page, Server
// Action and Route Handler calls one of these.

export type VerifiedSession = {
  actor: Actor;
  sessionVersion: number;
  /** A creator who signed up with Google and hasn't given a date of birth yet (see /welcome/age). */
  needsDateOfBirth: boolean;
};

export const AGE_GATE_PATH = "/welcome/age";

export const getSession = cache(async (): Promise<VerifiedSession | null> => {
  // Request time only. The session check (and the page code after it) reads the database, and a
  // fresh pool connection makes a SCRAM nonce with crypto.getRandomValues, which Cache Components
  // rejects during the runtime prefetch prerender.
  await connection();
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
    sessionVersion: user.sessionVersion,
    needsDateOfBirth: user.needsDateOfBirth && user.role === "creator",
  };
});

/**
 * Pages and actions that need a signed-in user. Until a Google sign-up gives their date of birth,
 * everything sends them to the age gate; only the gate itself passes `allowMissingDateOfBirth`.
 */
export async function verifySession(opts: { allowMissingDateOfBirth?: boolean } = {}): Promise<VerifiedSession> {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.needsDateOfBirth && !opts.allowMissingDateOfBirth) redirect(AGE_GATE_PATH);
  return session;
}

/** Renders the 403 page (forbidden.tsx) for users without one of `roles`. */
export async function requireRole(...roles: Role[]): Promise<VerifiedSession> {
  const session = await verifySession();
  if (!roles.includes(session.actor.role)) forbidden();
  return session;
}

/** Staff role plus a password confirmation from the last 10 minutes (sensitive admin actions). */
export async function requireStaffStepUp(...roles: Role[]): Promise<VerifiedSession> {
  const session = await requireRole(...(roles.length ? roles : (["staff", "super_admin"] as Role[])));
  await requireStepUp({ userId: session.actor.userId, sessionVersion: session.sessionVersion });
  return session;
}
