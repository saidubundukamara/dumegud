"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { signIn, signOut } from "@/auth";
import type { FormState } from "@/lib/form-state";
import { safeRedirectPath } from "@/lib/redirect";
import { getSession } from "@/server/dal/session";
import { assertNotBot } from "@/server/lib/bot";
import { field, invalidForm, runForm } from "@/server/lib/form";
import { logger } from "@/server/lib/logger";
import { enforceRateLimit } from "@/server/lib/rate-limit";
import { getRequestContext } from "@/server/lib/request";
import { services } from "@/server/services";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "@/server/validation/auth";

const INVALID_LOGIN = "Invalid email or password.";

/** Post-response work must never surface as an unhandled rejection. */
function afterSafely(label: string, task: () => Promise<void>) {
  after(() => task().catch((err) => logger.error(`after(): ${label} failed`, { err })));
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { email: field(formData, "email") };
  const parsed = loginSchema.safeParse({ email: values.email, password: field(formData, "password") });
  if (!parsed.success) return invalidForm(parsed.error, values);

  return runForm(async () => {
    await assertNotBot();
    try {
      await signIn("credentials", {
        ...parsed.data,
        redirectTo: safeRedirectPath(field(formData, "next")),
      });
    } catch (err) {
      if (err instanceof CredentialsSignin && err.code === "rate_limited") {
        return { status: "error", message: "Too many sign-in attempts. Please wait a few minutes and try again.", values };
      }
      if (err instanceof AuthError) return { status: "error", message: INVALID_LOGIN, values };
      throw err; // the success redirect (rethrown by runForm)
    }
    return { status: "idle" };
  }, values);
}

export async function signInWithGoogle(formData: FormData): Promise<void> {
  // Start from a signed-out browser: Auth.js would otherwise link this Google account to
  // whoever is still signed in here.
  const session = await getSession();
  if (session) {
    await services.auth.recordLogout(session.actor.userId, getRequestContext(await headers()));
    await signOut({ redirect: false });
  }
  await signIn("google", { redirectTo: safeRedirectPath(field(formData, "next")) });
}

export async function register(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { name: field(formData, "name"), email: field(formData, "email") };
  return runForm(async () => {
    await assertNotBot();
    const ctx = getRequestContext(await headers());
    await enforceRateLimit("register:ip", ctx.ip);

    const parsed = registerSchema.safeParse({ ...values, password: field(formData, "password") });
    if (!parsed.success) return invalidForm(parsed.error, values);

    const outcome = await services.auth.register(parsed.data);
    // Same response either way; the follow-up email is sent after the response so timing
    // doesn't reveal which branch ran.
    if (outcome.created) afterSafely("send verification email", () => services.auth.onUserCreated(outcome.userId));
    else afterSafely("send existing-account email", () => services.auth.sendExistingAccountEmail(outcome.email));

    return {
      status: "success",
      message: `We've sent a link to ${parsed.data.email}. Open it to confirm your email, then sign in.`,
    };
  }, values);
}

export async function verifyEmail(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = verifyEmailSchema.safeParse({ token: field(formData, "token") });
  if (!parsed.success) return { status: "error", message: "This link is invalid or has expired." };

  const result = await runForm(async () => {
    await services.auth.verifyEmail(parsed.data.token, getRequestContext(await headers()));
    return { status: "success" };
  });
  if (result.status !== "success") return result;
  redirect((await getSession()) ? "/dashboard?notice=email-verified" : "/login?notice=email-verified");
}

export async function forgotPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { email: field(formData, "email") };
  return runForm(async () => {
    await assertNotBot();
    const parsed = forgotPasswordSchema.safeParse(values);
    if (!parsed.success) return invalidForm(parsed.error, values);

    await enforceRateLimit("password-reset:email", parsed.data.email);
    const ctx = getRequestContext(await headers());
    afterSafely("password reset request", () => services.auth.requestPasswordReset(parsed.data.email, ctx));

    return {
      status: "success",
      message: `If ${parsed.data.email} has a DuMeGud account with a password, we've sent it a reset link. It expires in 30 minutes.`,
    };
  }, values);
}

export async function resetPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = resetPasswordSchema.safeParse({
    token: field(formData, "token"),
    password: field(formData, "password"),
    confirmPassword: field(formData, "confirmPassword"),
  });
  if (!parsed.success) return invalidForm(parsed.error);

  const result = await runForm(async () => {
    await services.auth.resetPassword(parsed.data, getRequestContext(await headers()));
    return { status: "success" };
  });
  if (result.status !== "success") return result;
  redirect("/login?notice=password-reset");
}
