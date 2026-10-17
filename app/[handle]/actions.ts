"use server";

import { updateTag } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/form-state";
import { assertNotBot } from "@/server/lib/bot";
import { field, invalidForm, runForm } from "@/server/lib/form";
import { getRequestContext } from "@/server/lib/request";
import { services } from "@/server/services";
import { SUPPORT_CLAIM_COOKIE } from "@/lib/claim-cookie";
import { addShoutoutSchema, startSupportSchema } from "@/server/validation/support";

/** Support widget: start a Monime checkout and send the supporter there. No sign-in needed. */
export async function startSupport(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = {
    amount: field(formData, "amount"),
    supporterName: field(formData, "supporterName"),
    message: field(formData, "message"),
    socialPlatform: field(formData, "socialPlatform"),
    socialHandle: field(formData, "socialHandle"),
  };
  const parsed = startSupportSchema.safeParse({
    handle: field(formData, "handle"),
    amount: values.amount,
    supporterName: values.supporterName,
    message: values.message,
    isAnonymous: field(formData, "isAnonymous") === "on",
    socialPlatform: values.socialPlatform,
    socialHandle: values.socialHandle,
    shoutoutConsent: field(formData, "shoutoutConsent") === "on",
    source: field(formData, "source"),
  });
  if (!parsed.success) return invalidForm(parsed.error, values);

  let redirectUrl: string | null = null;
  const result = await runForm(async () => {
    await assertNotBot();
    const started = await services.contributions.start(parsed.data, getRequestContext(await headers()));
    // Lets this browser add a shout-out handle on the Thank-you page.
    if (started.claim) (await cookies()).set(SUPPORT_CLAIM_COOKIE, started.claim, CLAIM_COOKIE_OPTIONS);
    redirectUrl = started.redirectUrl;
    return { status: "success" };
  }, values);
  if (!redirectUrl) return result;
  redirect(redirectUrl); // Monime's hosted checkout
}

const CLAIM_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax", // sent on the top-level return from Monime
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 24 * 60 * 60,
} as const;

/** Thank-you page: the browser that paid adds its shout-out username. */
export async function addShoutout(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { socialPlatform: field(formData, "socialPlatform"), socialHandle: field(formData, "socialHandle") };
  const parsed = addShoutoutSchema.safeParse({ paymentId: field(formData, "paymentId"), ...values });
  if (!parsed.success) return invalidForm(parsed.error, values);
  return runForm(async () => {
    const { tags } = await services.contributions.addShoutout(
      parsed.data,
      (await cookies()).get(SUPPORT_CLAIM_COOKIE)?.value,
      getRequestContext(await headers()),
    );
    tags.forEach((tag) => updateTag(tag));
    return { status: "success", message: "You're on the list. Watch out for your shout-out!" };
  }, values);
}
