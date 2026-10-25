"use server";

import type { FormState } from "@/lib/form-state";
import { requireAdminStepUp, requirePermission } from "@/server/dal/admin-session";
import { riskTier } from "@/server/db/schema";
import { field } from "@/server/lib/form";
import { services } from "@/server/services";
import { runAdminForm } from "@/app/(admin)/admin/run-admin-form";

const TIERS = riskTier.enumValues;
type Tier = (typeof TIERS)[number];
const isTier = (v: string): v is Tier => (TIERS as readonly string[]).includes(v);

/** The tier picks which transaction limits apply. Sent with the tier the admin saw (no lost updates). */
export async function setCreatorRiskTier(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission("creators.status");
  return runAdminForm(async () => {
    const { actor } = await requireAdminStepUp("creators.status");
    const expected = field(formData, "expected");
    const tier = field(formData, "tier");
    if (!isTier(expected) || !isTier(tier)) return { status: "error", message: "Choose a tier." };
    if (expected === tier) return { status: "error", message: "That’s already the tier." };
    const reason = field(formData, "note").trim().slice(0, 500);
    if (!reason) return { status: "error", message: "Give a reason." };
    await services.admin.setRiskTier(actor, field(formData, "userId"), expected, tier, reason);
    return { status: "success", message: "Risk tier changed." };
  });
}
