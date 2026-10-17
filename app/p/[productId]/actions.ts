"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { CLAIM_COOKIE } from "@/lib/claim-cookie";
import type { FormState } from "@/lib/form-state";
import { assertNotBot } from "@/server/lib/bot";
import { field, invalidForm, runForm } from "@/server/lib/form";
import { getRequestContext } from "@/server/lib/request";
import { services } from "@/server/services";
import { purchaseSchema } from "@/server/validation/product";

/** Buy a product as a guest: email for the receipt, then Monime checkout. */
export async function startPurchase(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { email: field(formData, "email"), buyerName: field(formData, "buyerName") };
  const parsed = purchaseSchema.safeParse({ productId: field(formData, "productId"), ...values });
  if (!parsed.success) return invalidForm(parsed.error, values);

  let redirectUrl: string | null = null;
  const result = await runForm(async () => {
    await assertNotBot();
    const started = await services.orders.start(parsed.data, getRequestContext(await headers()));
    (await cookies()).set(CLAIM_COOKIE, started.claim, {
      httpOnly: true,
      sameSite: "lax", // sent on the top-level return from Monime
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 24 * 60 * 60,
    });
    redirectUrl = started.redirectUrl;
    return { status: "success" };
  }, values);
  if (!redirectUrl) return result;
  redirect(redirectUrl);
}
