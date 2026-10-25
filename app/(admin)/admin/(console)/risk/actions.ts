"use server";

import type { FormState } from "@/lib/form-state";
import { requireAdminStepUp, requirePermission } from "@/server/dal/admin-session";
import { field } from "@/server/lib/form";
import { runAdminForm } from "@/app/(admin)/admin/run-admin-form";
import { services } from "@/server/services";

export async function openCase(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requirePermission("risk.cases");
  return runAdminForm(async () => {
    await services.cases.openCase(actor, { creatorId: field(formData, "creatorId"), alertIds: formData.getAll("alertId").map(String), note: field(formData, "note") });
    return { status: "success", message: "Case opened. It’s in Open cases." };
  });
}

export async function dismissAlert(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requirePermission("risk.cases");
  return runAdminForm(async () => {
    await services.cases.dismissAlert(actor, field(formData, "alertId"));
    return { status: "success", message: "Alert dismissed." };
  });
}

const DECISIONS = ["dismiss", "request_info", "restrict", "pause_feature", "escalate", "restore"] as const;
const FEATURES = ["receive", "withdraw", "publish", "upload"] as const;

export async function decideCase(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requirePermission("risk.cases");
  const decision = field(formData, "decision") as (typeof DECISIONS)[number];
  const feature = field(formData, "feature") as (typeof FEATURES)[number] | "";
  if (!DECISIONS.includes(decision)) return { status: "error", message: "Choose a decision." };
  return runAdminForm(async () => {
    if (decision === "restrict" || decision === "pause_feature" || decision === "restore") await requireAdminStepUp("risk.cases");
    const { applied } = await services.cases.decide(actor, field(formData, "caseId"), {
      decision,
      feature: FEATURES.includes(feature as (typeof FEATURES)[number]) ? (feature as (typeof FEATURES)[number]) : undefined,
      notes: field(formData, "notes").slice(0, 2000),
    });
    return { status: "success", message: applied ? "Decision recorded." : "Proposed. A second admin has to approve it." };
  });
}

export async function addCaseNote(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requirePermission("risk.cases");
  const text = field(formData, "note").trim();
  if (!text) return { status: "error", message: "Write the note first." };
  return runAdminForm(async () => {
    await services.cases.addNote(actor, field(formData, "caseId"), text);
    return { status: "success", message: "Note added." };
  });
}
