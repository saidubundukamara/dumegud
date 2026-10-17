"use server";

import type { FormState } from "@/lib/form-state";
import { requireRole, requireStaffStepUp } from "@/server/dal/session";
import { field, runForm } from "@/server/lib/form";
import { services } from "@/server/services";

export async function decideKyc(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requireRole("staff", "super_admin");
  const outcome = field(formData, "outcome");
  if (outcome !== "approved" && outcome !== "rejected" && outcome !== "needs_more_info") return { status: "error", message: "Choose a decision." };
  const note = field(formData, "note").trim().slice(0, 500) || null;
  if (outcome !== "approved" && !note) return { status: "error", message: "Tell the creator what to fix." };
  return runForm(async () => {
    // Approving identity is sensitive (unlocks withdrawals): it needs step-up.
    if (outcome === "approved") await requireStaffStepUp();
    await services.kyc.decide(actor, field(formData, "submissionId"), { outcome, note, reasonCode: outcome === "approved" ? null : outcome });
    return { status: "success", message: "Saved." };
  });
}
