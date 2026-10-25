import "server-only";
import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { adminHref } from "@/lib/admin-host";
import type { AdminPermission } from "@/lib/admin-permissions";
import { getEnv } from "@/server/env";
import { signToken, verifySignedToken } from "@/server/lib/crypto";
import { services } from "@/server/services";
import { can } from "@/server/services/actor";
import { ADMIN_SESSION_ABSOLUTE_MS, type PendingAdmin, type ResolvedAdminSession } from "@/server/services/AdminAuthService";
import { requireStepUp } from "./step-up";

// Data Access Layer for admins (admin subdomain only). The cookie holds a random session token;
// every request looks the session up in the database with the admin's current roles, so a
// suspension, role change or revoked session applies on the next request. Layouts don't gate;
// every admin page, Server Action and Route Handler calls one of these.

const isProd = process.env.NODE_ENV === "production";
/** `__Host-` (Secure, host-only, path=/) in production; plain over http://admin.localhost. */
export const ADMIN_SESSION_COOKIE = isProd ? "__Host-dmg_admin" : "dmg_admin";
const PENDING_COOKIE = isProd ? "__Host-dmg_admin_pending" : "dmg_admin_pending";
const PENDING_TTL_SECONDS = 10 * 60;

const cookieBase = { httpOnly: true, sameSite: "strict" as const, secure: isProd, path: "/" };

export const getAdminSession = cache(async (): Promise<ResolvedAdminSession | null> => {
  // Request time only (reads the database; see getSession in session.ts).
  await connection();
  const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!token || token.length > 128) return null;
  return services.adminAuth.resolveSession(token);
});

/** Pages and actions that need a signed-in admin. */
export async function requireAdmin(): Promise<ResolvedAdminSession> {
  const session = await getAdminSession();
  if (!session) redirect(adminHref("/admin/login"));
  return session;
}

/** Renders the 403 page (forbidden.tsx) unless the admin holds every one of `permissions`. */
export async function requirePermission(...permissions: AdminPermission[]): Promise<ResolvedAdminSession> {
  const session = await requireAdmin();
  if (!permissions.every((p) => can(session.actor, p))) forbidden();
  return session;
}

/** The permission plus an authenticator code from the last 10 minutes (sensitive actions). */
export async function requireAdminStepUp(...permissions: AdminPermission[]): Promise<ResolvedAdminSession> {
  const session = await requirePermission(...permissions);
  await requireStepUp(stepUpSubject(session));
  return session;
}

export function stepUpSubject(session: ResolvedAdminSession) {
  return { adminId: session.actor.adminId, sessionId: session.sessionId, sessionVersion: session.sessionVersion };
}

// ── Cookies ───────────────────────────────────────────────────────────────────

export async function setAdminSessionCookie(token: string): Promise<void> {
  // The database enforces the 30-minute idle and 12-hour absolute limits; the cookie only needs
  // to outlive them.
  (await cookies()).set(ADMIN_SESSION_COOKIE, token, { ...cookieBase, maxAge: ADMIN_SESSION_ABSOLUTE_MS / 1000 });
}

export async function readAdminSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
}

export async function clearAdminSessionCookie(): Promise<void> {
  (await cookies()).set(ADMIN_SESSION_COOKIE, "", { ...cookieBase, maxAge: 0 });
}

// ── Between the password and the second factor ────────────────────────────────

/** `2fa` = enter a code; `enroll` = set up an authenticator first (new admin). */
export type PendingPurpose = "2fa" | "enroll";

function pendingSecret(): string {
  return createHmac("sha256", getEnv().AUTH_SECRET).update("dumegud-admin-pending").digest("base64url");
}

export async function setPendingAdmin(pending: PendingAdmin, purpose: PendingPurpose): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + PENDING_TTL_SECONDS;
  const token = signToken(`${pending.adminId}|${pending.sessionVersion}|${purpose}|${exp}`, pendingSecret());
  (await cookies()).set(PENDING_COOKIE, token, { ...cookieBase, maxAge: PENDING_TTL_SECONDS });
}

/** Who passed the password step (bound to their session version, 10 minutes), or null. */
export async function readPendingAdmin(purpose: PendingPurpose): Promise<PendingAdmin | null> {
  const token = (await cookies()).get(PENDING_COOKIE)?.value;
  if (!token) return null;
  await connection(); // request time only: the expiry check reads the clock
  const [adminId, sv, kind, exp] = verifySignedToken(token, pendingSecret())?.split("|") ?? [];
  if (!adminId || kind !== purpose || !(Number(exp) > Date.now() / 1000)) return null;
  return { adminId, sessionVersion: Number(sv) };
}

export async function clearPendingAdmin(): Promise<void> {
  (await cookies()).set(PENDING_COOKIE, "", { ...cookieBase, maxAge: 0 });
}
