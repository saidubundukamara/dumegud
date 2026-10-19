"use server";

import type { FormState } from "@/lib/form-state";
import { formatSLE } from "@/lib/money";
import { verifySession } from "@/server/dal/session";
import { toActionResult, ValidationError, type ActionResult } from "@/server/lib/errors";
import { field, invalidForm, runForm } from "@/server/lib/form";
import { services } from "@/server/services";
import { bindMethodSchema, kycSubmitSchema, kycUploadSchema, withdrawSchema } from "@/server/validation/wallet";

export async function requestKycUpload(input: { doc: string; contentType: string; size: number }): Promise<ActionResult<{ key: string; url: string }>> {
  const { actor } = await verifySession();
  return toActionResult(async () => {
    const parsed = kycUploadSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message);
    return services.kyc.requestUpload(actor, parsed.data);
  });
}

export async function submitKyc(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await verifySession();
  const values = { legalName: field(formData, "legalName"), dateOfBirth: field(formData, "dateOfBirth"), idType: field(formData, "idType") };
  const parsed = kycSubmitSchema.safeParse({
    ...values,
    idNumber: field(formData, "idNumber"),
    idFrontKey: field(formData, "idFrontKey"),
    idBackKey: field(formData, "idBackKey"),
    selfieKey: field(formData, "selfieKey"),
  });
  if (!parsed.success) return invalidForm(parsed.error, values);
  return runForm(async () => {
    await services.kyc.submit(actor, parsed.data);
    return { status: "success", message: "Thanks! We'll review your documents, usually within one working day." };
  }, values);
}

export async function bindPayoutMethod(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await verifySession();
  const values = { phone: field(formData, "phone"), providerId: field(formData, "providerId") };
  const parsed = bindMethodSchema.safeParse(values);
  if (!parsed.success) return invalidForm(parsed.error, values);
  return runForm(async () => {
    const method = await services.payoutMethods.bind(actor, parsed.data);
    return {
      status: "success",
      message:
        method.status === "needs_recheck"
          ? "The name registered to this number doesn't match your verified name. Our team will check it."
          : `Saved ${method.masked} (${method.holderName}).`,
    };
  }, values);
}

export async function withdraw(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await verifySession();
  const values = { amount: field(formData, "amount") };
  const parsed = withdrawSchema.safeParse(values);
  if (!parsed.success) return invalidForm(parsed.error, values);
  return runForm(async () => {
    const payout = await services.payouts.request(actor, { amountMinor: parsed.data.amount, final: field(formData, "final") === "1" });
    const message =
      payout.status === "in_review"
        ? `Your withdrawal of ${formatSLE(payout.amountMinor)} is waiting for a quick review.`
        : payout.status === "failed"
          ? `Your withdrawal didn't go through: ${payout.failureMessage ?? "please try again"}.`
          : `Your withdrawal of ${formatSLE(payout.amountMinor)} is on its way.`;
    return { status: payout.status === "failed" ? "error" : "success", message };
  }, values);
}
