import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { auth } from "@/auth";
import type { Actor } from "@/server/services/actor";
import { repos } from "@/server/services";

// Data Access Layer for creator authentication (admins use admin-session.ts). The JWT says who
// the caller claims to be; this checks the database on every request so suspension and "sign out
// everywhere" (sessionVersion bumps) take effect immediately. Layouts don't gate; every page, Server
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
    actor: { userId: user.id, status: user.status, emailVerified: user.emailVerified !== null },
    sessionVersion: user.sessionVersion,
    needsDateOfBirth: user.needsDateOfBirth,
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
