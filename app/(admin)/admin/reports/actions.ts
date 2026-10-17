"use server";

import { updateTag } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { requireRole } from "@/server/dal/session";
import { field, runForm } from "@/server/lib/form";
import { services } from "@/server/services";

export async function resolveReport(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requireRole("staff", "super_admin");
  const action = field(formData, "action") === "suspend" ? "suspend" : "dismiss";
  const reason = field(formData, "reason").trim();
  if (action === "suspend" && !reason) return { status: "error", message: "Give a reason for the takedown." };
  return runForm(async () => {
    const { tags } = await services.reports.resolve(actor, field(formData, "reportId"), { action, reason });
    tags.forEach((t) => updateTag(t));
    return { status: "success", message: action === "suspend" ? "Taken down." : "Dismissed." };
  });
}
