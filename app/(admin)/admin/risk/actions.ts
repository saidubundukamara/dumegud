"use server";

import type { FormState } from "@/lib/form-state";
import { requireRole, requireStaffStepUp } from "@/server/dal/session";
import { field, runForm } from "@/server/lib/form";
import { services } from "@/server/services";

export async function openCase(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requireRole("staff", "super_admin");
  return runForm(async () => {
    await services.cases.openCase(actor, { creatorId: field(formData, "creatorId"), alertIds: formData.getAll("alertId").map(String), note: field(formData, "note") });
    return { status: "success", message: "Case opened." };
  });
}

export async function dismissAlert(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requireRole("staff", "super_admin");
  return runForm(async () => {
    await services.cases.dismissAlert(actor, field(formData, "alertId"));
    return { status: "success", message: "Dismissed." };
  });
}

const DECISIONS = ["dismiss", "request_info", "restrict", "pause_feature", "escalate", "restore"] as const;
const FEATURES = ["receive", "withdraw", "publish", "upload"] as const;

export async function decideCase(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requireRole("staff", "super_admin");
  const decision = field(formData, "decision") as (typeof DECISIONS)[number];
  const feature = field(formData, "feature") as (typeof FEATURES)[number] | "";
  if (!DECISIONS.includes(decision)) return { status: "error", message: "Choose a decision." };
  return runForm(async () => {
    if (decision === "restrict" || decision === "pause_feature" || decision === "restore") await requireStaffStepUp();
    const { applied } = await services.cases.decide(actor, field(formData, "caseId"), {
      decision,
      feature: FEATURES.includes(feature as (typeof FEATURES)[number]) ? (feature as (typeof FEATURES)[number]) : undefined,
      notes: field(formData, "notes").slice(0, 2000),
    });
    return { status: "success", message: applied ? "Decision applied." : "Waiting for a second staff member to approve." };
  });
}
