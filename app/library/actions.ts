"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { FormState } from "@/lib/form-state";
import { field, runForm } from "@/server/lib/form";
import { enforceRateLimit } from "@/server/lib/rate-limit";
import { getRequestContext } from "@/server/lib/request";
import { services } from "@/server/services";
import { forgotPasswordSchema } from "@/server/validation/auth";

/** Mint a 60-second download token for one file and hand over to the download route. */
export async function downloadFile(_prev: FormState, formData: FormData): Promise<FormState> {
  let token: string | null = null;
  const result = await runForm(async () => {
    token = await services.orders.mintDownloadToken(field(formData, "accessToken"), field(formData, "assetId"));
    return { status: "success" };
  });
  if (!token) return result;
  redirect(`/api/downloads/${token}`);
}

/** "Lost your link?": the same answer whether or not we know the email. */
export async function recoverLibrary(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { email: field(formData, "email") };
  const parsed = forgotPasswordSchema.safeParse(values);
  if (!parsed.success) return { status: "error", fieldErrors: { email: ["Enter a valid email address."] }, values };
  return runForm(async () => {
    await enforceRateLimit("library-recovery:ip", getRequestContext(await headers()).ip);
    await enforceRateLimit("library-recovery:email", parsed.data.email);
    await services.orders.sendLibraryLinks(parsed.data.email);
    return { status: "success", message: `If ${parsed.data.email} bought anything on DuMeGud, we've emailed it the download links.` };
  }, values);
}
