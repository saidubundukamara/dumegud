"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/form-state";
import { assertNotBot } from "@/server/lib/bot";
import { field, invalidForm, runForm } from "@/server/lib/form";
import { getRequestContext } from "@/server/lib/request";
import { services } from "@/server/services";
import { startSupportSchema } from "@/server/validation/support";

/** Support widget: start a Monime checkout and send the supporter there. No sign-in needed. */
export async function startSupport(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = {
    amount: field(formData, "amount"),
    supporterName: field(formData, "supporterName"),
    message: field(formData, "message"),
  };
  const parsed = startSupportSchema.safeParse({
    handle: field(formData, "handle"),
    amount: values.amount,
    supporterName: values.supporterName,
    message: values.message,
    isAnonymous: field(formData, "isAnonymous") === "on",
  });
  if (!parsed.success) return invalidForm(parsed.error, values);

  let redirectUrl: string | null = null;
  const result = await runForm(async () => {
    await assertNotBot();
    ({ redirectUrl } = await services.contributions.start(parsed.data, getRequestContext(await headers())));
    return { status: "success" };
  }, values);
  if (!redirectUrl) return result;
  redirect(redirectUrl); // Monime's hosted checkout
}
