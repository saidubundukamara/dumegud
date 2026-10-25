"use server";

import type { FormState } from "@/lib/form-state";
import { requireAdminStepUp, requirePermission } from "@/server/dal/admin-session";
import { field } from "@/server/lib/form";
import { runAdminForm } from "@/app/(admin)/admin/run-admin-form";
import { services } from "@/server/services";

export async function decideKyc(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requirePermission("kyc.decide");
  const outcome = field(formData, "outcome");
  if (outcome !== "approved" && outcome !== "rejected" && outcome !== "needs_more_info") return { status: "error", message: "Choose a decision." };
  const note = field(formData, "note").trim().slice(0, 500) || null;
  if (outcome !== "approved" && !note) return { status: "error", message: "Tell the creator what to fix." };
  return runAdminForm(async () => {
    // Approving identity is sensitive (unlocks withdrawals): it needs step-up.
    if (outcome === "approved") await requireAdminStepUp("kyc.decide");
    await services.kyc.decide(actor, field(formData, "submissionId"), { outcome, note, reasonCode: outcome === "approved" ? null : outcome });
    return { status: "success", message: "Saved." };
  });
}
