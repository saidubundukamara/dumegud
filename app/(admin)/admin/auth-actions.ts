"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { adminHref } from "@/lib/admin-host";
import type { FormState } from "@/lib/form-state";
import {
  clearAdminSessionCookie,
  clearPendingAdmin,
  readAdminSessionToken,
  readPendingAdmin,
  requireAdmin,
  setAdminSessionCookie,
  setPendingAdmin,
  stepUpSubject,
} from "@/server/dal/admin-session";
import { requireStepUp } from "@/server/dal/step-up";
import { field, runForm } from "@/server/lib/form";
import { getRequestContext } from "@/server/lib/request";
import { services } from "@/server/services";

// Admin sign-in: password → (first time) authenticator setup → code → session. Separate from the
// creators' Auth.js: different table, cookie and host. One generic error for every failure.

const WRONG = "That email and password don't match an admin account, or it's locked. Try again in a few minutes.";

export async function signInAdmin(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = field(formData, "email");
  const result = await runForm(async () => {
    const pending = await services.adminAuth.verifyPassword({ email, password: field(formData, "password") }, getRequestContext(await headers()));
    if (!pending) return { status: "error", message: WRONG };
    await setPendingAdmin(pending, pending.needsEnrollment ? "enroll" : "2fa");
    return { status: "success", message: pending.needsEnrollment ? "enroll" : "2fa" };
  }, { email });
  if (result.status !== "success") return result;
  redirect(adminHref(result.message === "enroll" ? "/admin/2fa/setup" : "/admin/2fa"));
}

export async function verifyAdminCode(_prev: FormState, formData: FormData): Promise<FormState> {
  const result = await runForm(async () => {
    const pending = await readPendingAdmin("2fa");
    if (!pending) return { status: "error", message: "Your sign-in timed out. Start again." };
    const session = await services.adminAuth.verifySecondFactor(pending, field(formData, "code"), getRequestContext(await headers()));
    if (!session) return { status: "error", message: "That code didn't work. Wait for a new one, or use a recovery code." };
    await setAdminSessionCookie(session.token);
    await clearPendingAdmin();
    return { status: "success" };
  });
  if (result.status !== "success") return result;
  redirect(adminHref("/admin"));
}

/** On success the recovery codes come back once, in `values.recoveryCodes` (newline-separated). */
export async function confirmAdminEnrollment(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(async () => {
    const pending = await readPendingAdmin("enroll");
    if (!pending) return { status: "error", message: "Your sign-in timed out. Start again." };
    const done = await services.adminAuth.confirmEnrollment(pending, field(formData, "code"), getRequestContext(await headers()));
    if (!done) return { status: "error", message: "That code didn't match. Check the time on your phone and try the next code." };
    await setAdminSessionCookie(done.token);
    await clearPendingAdmin();
    return { status: "success", message: "Your authenticator is set up.", values: { recoveryCodes: done.recoveryCodes.join("\n") } };
  });
}

export async function acceptAdminInvite(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = field(formData, "name");
  const result = await runForm(async () => {
    const pending = await services.adminAccounts.acceptInvite(field(formData, "token"), { name, password: field(formData, "password") });
    await setPendingAdmin(pending, "enroll");
    return { status: "success" };
  }, { name });
  if (result.status !== "success") return result;
  redirect(adminHref("/admin/2fa/setup"));
}

export async function signOutAdmin(): Promise<void> {
  const token = await readAdminSessionToken();
  if (token) await services.adminAuth.logout(token, getRequestContext(await headers()));
  await clearAdminSessionCookie();
  redirect(adminHref("/admin/login"));
}

// ── Account page ──────────────────────────────────────────────────────────────

export async function changeAdminPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdmin();
  return runForm(async () => {
    const token = await services.adminAuth.changePassword(
      session.actor,
      { currentPassword: field(formData, "currentPassword"), newPassword: field(formData, "newPassword") },
      getRequestContext(await headers()),
    );
    await setAdminSessionCookie(token);
    return { status: "success", message: "Password changed. Every other session was signed out." };
  });
}

export async function revokeAdminSession(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireAdmin();
  return runForm(async () => {
    await services.adminAuth.revokeOwnSession(session.actor, field(formData, "sessionId"), getRequestContext(await headers()));
    return { status: "success", message: "Signed out." };
  });
}

/** Needs a fresh step-up; the new codes come back once in `values.recoveryCodes`. */
export async function regenerateAdminRecoveryCodes(): Promise<FormState> {
  const session = await requireAdmin();
  return runForm(async () => {
    await requireStepUp(stepUpSubject(session));
    const codes = await services.adminAuth.regenerateRecoveryCodes(session.actor);
    return { status: "success", message: "New recovery codes. The old ones no longer work.", values: { recoveryCodes: codes.join("\n") } };
  });
}
