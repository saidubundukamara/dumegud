import "server-only";
import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { getEnv } from "@/server/env";
import { signToken, verifySignedToken } from "@/server/lib/crypto";
import { StepUpRequiredError } from "@/server/lib/errors";

// Admin step-up: sensitive admin actions need a fresh authenticator code from the last 10
// minutes. The proof is a short-lived signed cookie bound to the admin session (id + session
// version), so signing out, a role change or "revoke session" voids it.

export const STEP_UP_COOKIE = "dmg_stepup";
export const STEP_UP_TTL_SECONDS = 10 * 60;

function secret(): string {
  return createHmac("sha256", getEnv().AUTH_SECRET).update("dumegud-admin-step-up").digest("base64url");
}

/** The admin session a step-up belongs to. */
export type StepUpSubject = { adminId: string; sessionId: string; sessionVersion: number };

const subjectKey = (who: StepUpSubject) => `${who.adminId}|${who.sessionId}|${who.sessionVersion}`;

export function stepUpToken(who: StepUpSubject, nowSeconds: number): string {
  return signToken(`${subjectKey(who)}|${nowSeconds + STEP_UP_TTL_SECONDS}`, secret());
}

/** Seconds of step-up left for this admin session (0 = none). */
export function stepUpRemaining(token: string | undefined, who: StepUpSubject, nowSeconds: number): number {
  if (!token) return 0;
  const parts = verifySignedToken(token, secret())?.split("|") ?? [];
  const exp = parts.pop();
  if (parts.join("|") !== subjectKey(who)) return 0;
  return Math.max(0, Number(exp) - nowSeconds);
}

export async function grantStepUp(who: StepUpSubject): Promise<void> {
  (await cookies()).set(STEP_UP_COOKIE, stepUpToken(who, Math.floor(Date.now() / 1000)), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STEP_UP_TTL_SECONDS,
  });
}

export async function stepUpSecondsLeft(who: StepUpSubject): Promise<number> {
  await connection(); // reads the clock: request time only
  return stepUpRemaining((await cookies()).get(STEP_UP_COOKIE)?.value, who, Math.floor(Date.now() / 1000));
}

/** Throws StepUpRequiredError unless a code was confirmed in the last 10 minutes. */
export async function requireStepUp(who: StepUpSubject): Promise<void> {
  if ((await stepUpSecondsLeft(who)) <= 0) throw new StepUpRequiredError();
}
