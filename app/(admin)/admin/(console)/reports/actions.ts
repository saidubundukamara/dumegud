"use server";

import { updateTag } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { requirePermission } from "@/server/dal/admin-session";
import { field } from "@/server/lib/form";
import { runAdminForm } from "@/app/(admin)/admin/run-admin-form";
import { services } from "@/server/services";

export async function resolveReport(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requirePermission("reports.resolve");
  const action = field(formData, "action") === "suspend" ? "suspend" : "dismiss";
  const reason = field(formData, "reason").trim();
  if (action === "suspend" && !reason) return { status: "error", message: "Give a reason for the takedown." };
  return runAdminForm(async () => {
    const { tags } = await services.reports.resolve(actor, field(formData, "reportId"), { action, reason });
    tags.forEach((t) => updateTag(t));
    return { status: "success", message: action === "suspend" ? "Taken down. The report is closed." : "Report closed." };
  });
}

/** Take a creator page or product down, or put it back, without a report. */
export async function moderateContent(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requirePermission("reports.resolve");
  const targetType = field(formData, "targetType");
  const action = field(formData, "action");
  if ((targetType !== "creator" && targetType !== "product") || (action !== "suspend" && action !== "restore")) return { status: "error", message: "Reload the page and try again." };
  const reason = field(formData, "note").trim();
  if (!reason) return { status: "error", message: "Give a reason. The audit log keeps it." };
  return runAdminForm(async () => {
    const { tags } = await services.reports.moderate(actor, { targetType, targetId: field(formData, "targetId"), action, reason });
    tags.forEach((t) => updateTag(t));
    const what = targetType === "creator" ? "page" : "product";
    return { status: "success", message: action === "suspend" ? `The ${what} is down.` : `Restored as unpublished. The creator can publish it again${targetType === "product" ? " (it goes through review)" : ""}.` };
  });
}
