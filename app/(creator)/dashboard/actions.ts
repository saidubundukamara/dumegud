"use server";

import { refresh, updateTag } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import type { FormState } from "@/lib/form-state";
import { getSession, verifySession } from "@/server/dal/session";
import { profileChangeTags } from "@/server/lib/cache-tags";
import { field, invalidForm, runForm } from "@/server/lib/form";
import { getRequestContext } from "@/server/lib/request";
import { services } from "@/server/services";
import { changePasswordSchema } from "@/server/validation/auth";

export async function signOutAction(): Promise<void> {
  const session = await getSession();
  if (session) await services.auth.recordLogout(session.actor.userId, getRequestContext(await headers()));
  await signOut({ redirectTo: "/" });
}

export async function signOutEverywhere(): Promise<void> {
  const { actor } = await verifySession();
  await services.auth.signOutEverywhere(actor, getRequestContext(await headers()));
  await signOut({ redirect: false });
  redirect("/login?notice=signed-out-everywhere");
}

export async function resendVerificationEmail(): Promise<FormState> {
  const { actor } = await verifySession();
  return runForm(async () => {
    await services.auth.resendVerificationEmail(actor);
    return { status: "success", message: "We've sent you a new confirmation link." };
  });
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await verifySession();
  const parsed = changePasswordSchema.safeParse({
    currentPassword: field(formData, "currentPassword"),
    password: field(formData, "password"),
    confirmPassword: field(formData, "confirmPassword"),
  });
  if (!parsed.success) return invalidForm(parsed.error);

  const result = await runForm(async () => {
    await services.auth.changePassword(actor, parsed.data, getRequestContext(await headers()));
    return { status: "success" };
  });
  if (result.status !== "success") return result;
  // Changing the password revoked every session, this one included.
  await signOut({ redirect: false });
  redirect("/login?notice=password-changed");
}

// ── Page & wallet ────────────────────────────────────────────────────────────────

export async function acceptCreatorTerms(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await verifySession();
  if (field(formData, "accept") !== "on") {
    return { status: "error", fieldErrors: { accept: ["Tick the box to accept the creator terms."] } };
  }
  return runForm(async () => {
    await services.creators.acceptCreatorTerms(actor);
    // Owner-only data, no cache tag to update: re-render the dashboard so the form goes away.
    refresh();
    return { status: "success" };
  });
}

export async function publishPage(): Promise<FormState> {
  const { actor } = await verifySession();
  return runForm(async () => {
    const change = await services.creators.publish(actor);
    profileChangeTags(change).forEach((tag) => updateTag(tag));
    return { status: "success", message: "Your page is live." };
  });
}

export async function unpublishPage(): Promise<FormState> {
  const { actor } = await verifySession();
  return runForm(async () => {
    const change = await services.creators.unpublish(actor);
    profileChangeTags(change).forEach((tag) => updateTag(tag));
    return { status: "success", message: "Your page is hidden. Visitors will see “page not found”." };
  });
}

export async function retryWalletSetup(): Promise<FormState> {
  const { actor } = await verifySession();
  return runForm(async () => {
    const wallet = await services.wallet.retryForActor(actor);
    if (wallet.ready) refresh();
    return wallet.ready
      ? { status: "success", message: "Your wallet is ready." }
      : { status: "error", message: "We couldn't set up your wallet yet. We'll keep trying automatically." };
  });
}
