import "server-only";
import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { getEnv } from "@/server/env";
import { signToken, verifySignedToken } from "@/server/lib/crypto";
import { StepUpRequiredError } from "@/server/lib/errors";

// Admin step-up (implementation.md Phase 1/8): sensitive admin actions need the password
// re-entered within the last 10 minutes. The proof is a short-lived signed cookie bound to the
// user id and session version, so "sign out everywhere" or a role change voids it.

export const STEP_UP_COOKIE = "dmg_stepup";
export const STEP_UP_TTL_SECONDS = 10 * 60;

function secret(): string {
  return createHmac("sha256", getEnv().AUTH_SECRET).update("dumegud-step-up").digest("base64url");
}

export function stepUpToken(userId: string, sessionVersion: number, nowSeconds: number): string {
  return signToken(`${userId}|${sessionVersion}|${nowSeconds + STEP_UP_TTL_SECONDS}`, secret());
}

/** Seconds of step-up left for this user and session version (0 = none). */
export function stepUpRemaining(token: string | undefined, userId: string, sessionVersion: number, nowSeconds: number): number {
  if (!token) return 0;
  const [id, sv, exp] = verifySignedToken(token, secret())?.split("|") ?? [];
  if (id !== userId || Number(sv) !== sessionVersion) return 0;
  return Math.max(0, Number(exp) - nowSeconds);
}

type Who = { userId: string; sessionVersion: number };

export async function grantStepUp(who: Who): Promise<void> {
  (await cookies()).set(STEP_UP_COOKIE, stepUpToken(who.userId, who.sessionVersion, Math.floor(Date.now() / 1000)), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STEP_UP_TTL_SECONDS,
  });
}

export async function stepUpSecondsLeft(who: Who): Promise<number> {
  return stepUpRemaining((await cookies()).get(STEP_UP_COOKIE)?.value, who.userId, who.sessionVersion, Math.floor(Date.now() / 1000));
}

/** Throws StepUpRequiredError unless the password was confirmed in the last 10 minutes. */
export async function requireStepUp(who: Who): Promise<void> {
  if ((await stepUpSecondsLeft(who)) <= 0) throw new StepUpRequiredError();
}
