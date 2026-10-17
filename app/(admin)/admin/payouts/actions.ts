"use server";

import type { FormState } from "@/lib/form-state";
import { requireRole, requireStaffStepUp } from "@/server/dal/session";
import { field, runForm } from "@/server/lib/form";
import { services } from "@/server/services";

export async function releasePayout(_prev: FormState, formData: FormData): Promise<FormState> {
  return runForm(async () => {
    const { actor } = await requireStaffStepUp();
    const { payout, released } = await services.payouts.release(actor, field(formData, "payoutId"));
    if (!released) return { status: "success", message: "Approved. A second staff member must also approve this amount." };
    return { status: payout.status === "failed" ? "error" : "success", message: payout.status === "failed" ? `Monime refused it: ${payout.failureMessage}` : "Released." };
  });
}

export async function rejectPayout(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requireRole("staff", "super_admin");
  const reason = field(formData, "reason").trim();
  if (!reason) return { status: "error", message: "Give a reason." };
  return runForm(async () => {
    await services.payouts.reject(actor, field(formData, "payoutId"), reason);
    return { status: "success", message: "Rejected." };
  });
}
