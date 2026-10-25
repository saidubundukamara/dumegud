"use server";

import { z } from "zod";
import type { FormState } from "@/lib/form-state";
import { parseMajorToMinor } from "@/lib/money";
import { requireAdminStepUp, requirePermission } from "@/server/dal/admin-session";
import { field, invalidForm } from "@/server/lib/form";
import { runAdminForm } from "@/app/(admin)/admin/run-admin-form";
import { services } from "@/server/services";

const limitSchema = z.object({
  id: z.union([z.literal("").transform(() => null), z.uuid()]),
  scope: z.enum(["per_contribution", "supporter_to_creator", "supporter_global", "creator_receipts", "creator_payouts", "velocity_count"]),
  window: z.enum(["single", "24h", "7d", "30d"]),
  verificationTier: z.union([z.literal("").transform(() => null), z.enum(["none", "email", "id_verified"])]),
  riskTier: z.union([z.literal("").transform(() => null), z.enum(["low", "medium", "high", "restricted"])]),
  maxAmount: z.string().transform((v, ctx) => {
    if (!v.trim()) return null;
    const minor = parseMajorToMinor(v);
    if (minor === null) {
      ctx.addIssue({ code: "custom", message: "Enter an amount in leones." });
      return z.NEVER;
    }
    return minor;
  }),
  maxCount: z.union([z.literal("").transform(() => null), z.coerce.number().int().positive()]),
  action: z.enum(["block", "review", "flag"]),
  active: z.boolean(),
});

export async function saveLimit(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission("limits.manage");
  const parsed = limitSchema.safeParse({
    id: field(formData, "id"),
    scope: field(formData, "scope"),
    window: field(formData, "window"),
    verificationTier: field(formData, "verificationTier"),
    riskTier: field(formData, "riskTier"),
    maxAmount: field(formData, "maxAmount"),
    maxCount: field(formData, "maxCount"),
    action: field(formData, "action"),
    active: field(formData, "active") === "on",
  });
  if (!parsed.success) return invalidForm(parsed.error);
  const { id, maxAmount, ...rest } = parsed.data;
  return runAdminForm(async () => {
    const { actor } = await requireAdminStepUp("limits.manage");
    await services.adminConfig.saveLimit(actor, id, { ...rest, maxAmountMinor: maxAmount });
    return { status: "success", message: "Saved. It applies to new payments right away." };
  });
}
