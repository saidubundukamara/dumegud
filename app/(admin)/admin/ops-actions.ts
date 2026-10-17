"use server";

import type { FormState } from "@/lib/form-state";
import { requireRole, requireStaffStepUp } from "@/server/dal/session";
import { field, runForm } from "@/server/lib/form";
import { services } from "@/server/services";

// Admin operations. Sensitive ones (money movement, account status/roles, settings, rules)
// need step-up; requireStaffStepUp runs inside runForm so a missing step-up shows as a form
// error while forbidden() for non-staff still propagates.

const USER_STATUSES = ["active", "restricted", "suspended", "closed"] as const;
const ROLES = ["creator", "staff", "super_admin"] as const;

export async function setUserStatus(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("staff", "super_admin");
  return runForm(async () => {
    const { actor } = await requireStaffStepUp();
    const status = field(formData, "status") as (typeof USER_STATUSES)[number];
    if (!USER_STATUSES.includes(status)) return { status: "error", message: "Choose a status." };
    const reason = field(formData, "note").trim();
    if (!reason) return { status: "error", message: "Give a reason." };
    await services.admin.setUserStatus(actor, field(formData, "userId"), status, reason);
    return { status: "success", message: `Status set to ${status}. Their sessions were signed out.` };
  });
}

export async function setUserRole(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("super_admin");
  return runForm(async () => {
    const { actor } = await requireStaffStepUp("super_admin");
    const role = field(formData, "role") as (typeof ROLES)[number];
    if (!ROLES.includes(role)) return { status: "error", message: "Choose a role." };
    await services.admin.setUserRole(actor, field(formData, "userId"), role);
    return { status: "success", message: `Role set to ${role}.` };
  });
}

export async function releasePaymentReview(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("staff", "super_admin");
  return runForm(async () => {
    const { actor } = await requireStaffStepUp();
    const payment = await services.admin.releasePaymentReview(actor, field(formData, "paymentId"), field(formData, "note"));
    return { status: "success", message: `Released. Status: ${payment.status}.` };
  });
}

export async function resyncPayment(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requireRole("staff", "super_admin");
  return runForm(async () => {
    const payment = await services.admin.resyncPayment(actor, field(formData, "paymentId"));
    return { status: "success", message: `Re-synced. Status: ${payment?.status ?? "unknown"}.` };
  });
}

export async function retryTransfer(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requireRole("staff", "super_admin");
  return runForm(async () => {
    const outcome = await services.admin.retryTransfer(actor, field(formData, "paymentId"));
    return { status: outcome === "failed" ? "error" : "success", message: `Transfer: ${outcome}.` };
  });
}

export async function redispatchPayout(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("staff", "super_admin");
  return runForm(async () => {
    const { actor } = await requireStaffStepUp();
    const payout = await services.admin.redispatchPayout(actor, field(formData, "payoutId"));
    return { status: "success", message: `Payout: ${payout.status}.` };
  });
}

export async function resyncPayout(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requireRole("staff", "super_admin");
  return runForm(async () => {
    await services.admin.resyncPayout(actor, field(formData, "payoutId"));
    return { status: "success", message: "Re-synced." };
  });
}

export async function replayWebhook(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("staff", "super_admin");
  return runForm(async () => {
    const { actor } = await requireStaffStepUp();
    const status = await services.admin.replayWebhook(actor, field(formData, "eventId"));
    return { status: status === "failed" ? "error" : "success", message: `Replayed: ${status}.` };
  });
}

export async function updateSetting(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("super_admin");
  return runForm(async () => {
    const { actor } = await requireStaffStepUp("super_admin");
    let value: unknown;
    try {
      value = JSON.parse(field(formData, "value"));
    } catch {
      return { status: "error", message: "The value must be valid JSON (numbers as-is, text in quotes, true/false)." };
    }
    const version = await services.adminConfig.updateSetting(actor, field(formData, "key"), value);
    return { status: "success", message: `Saved as version ${version}.` };
  });
}

export async function updateRule(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireRole("super_admin");
  return runForm(async () => {
    const { actor } = await requireStaffStepUp("super_admin");
    let params: unknown;
    try {
      params = JSON.parse(field(formData, "params"));
    } catch {
      return { status: "error", message: "Parameters must be valid JSON." };
    }
    const severity = field(formData, "severity");
    if (severity !== "low" && severity !== "medium" && severity !== "high") return { status: "error", message: "Choose a severity." };
    await services.admin.updateRule(actor, field(formData, "code"), { params, severity, active: field(formData, "active") === "on" });
    return { status: "success", message: "Rule saved." };
  });
}
