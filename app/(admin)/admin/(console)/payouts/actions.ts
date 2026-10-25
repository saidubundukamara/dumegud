"use server";

import type { FormState } from "@/lib/form-state";
import { requireAdminStepUp, requirePermission } from "@/server/dal/admin-session";
import { field } from "@/server/lib/form";
import { runAdminForm } from "@/app/(admin)/admin/run-admin-form";
import { services } from "@/server/services";

export async function releasePayout(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission("payouts.approve");
  return runAdminForm(async () => {
    const { actor } = await requireAdminStepUp("payouts.approve");
    const { payout, released } = await services.payouts.release(actor, field(formData, "payoutId"));
    if (!released) return { status: "success", message: "Approved. A second admin has to approve it too." };
    return { status: payout.status === "failed" ? "error" : "success", message: payout.status === "failed" ? `Monime refused it: ${payout.failureMessage}` : "Released. Monime is sending it now." };
  });
}

export async function rejectPayout(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requirePermission("payouts.reject");
  const reason = field(formData, "reason").trim();
  if (!reason) return { status: "error", message: "Give a reason." };
  return runAdminForm(async () => {
    await services.payouts.reject(actor, field(formData, "payoutId"), reason);
    return { status: "success", message: "Rejected. The creator sees your reason." };
  });
}
