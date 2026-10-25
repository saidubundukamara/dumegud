"use server";

import { updateTag } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { SETTINGS_TAG } from "@/server/lib/cache-tags";
import { fromInput, metaFor } from "./(console)/settings/meta";
import { requireAdminStepUp, requirePermission } from "@/server/dal/admin-session";
import { field } from "@/server/lib/form";
import { runAdminForm } from "@/app/(admin)/admin/run-admin-form";
import { services } from "@/server/services";

// Admin operations. Each checks its permission first (forbidden() propagates as a 403); the
// sensitive ones (money movement, account status, settings, rules) also need step-up, checked
// inside runForm so a missing step-up shows as a form error.

const USER_STATUSES = ["active", "restricted", "suspended", "closed"] as const;

export async function setUserStatus(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission("creators.status");
  return runAdminForm(async () => {
    const { actor } = await requireAdminStepUp("creators.status");
    const status = field(formData, "status") as (typeof USER_STATUSES)[number];
    if (!USER_STATUSES.includes(status)) return { status: "error", message: "Choose a status." };
    const reason = field(formData, "note").trim();
    if (!reason) return { status: "error", message: "Give a reason." };
    await services.admin.setUserStatus(actor, field(formData, "userId"), status, reason);
    return { status: "success", message: `Status set to ${status}. Their sessions were signed out.` };
  });
}

export async function releasePaymentReview(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission("payments.manage");
  return runAdminForm(async () => {
    const { actor } = await requireAdminStepUp("payments.manage");
    const payment = await services.admin.releasePaymentReview(actor, field(formData, "paymentId"), field(formData, "note"));
    return { status: "success", message: `Released. Status: ${payment.status}.` };
  });
}

export async function resyncPayment(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requirePermission("payments.manage");
  return runAdminForm(async () => {
    const payment = await services.admin.resyncPayment(actor, field(formData, "paymentId"));
    return { status: "success", message: `Re-synced. Status: ${payment?.status ?? "unknown"}.` };
  });
}

export async function retryTransfer(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requirePermission("payments.manage");
  return runAdminForm(async () => {
    const outcome = await services.admin.retryTransfer(actor, field(formData, "paymentId"));
    return { status: outcome === "failed" ? "error" : "success", message: `Transfer: ${outcome}.` };
  });
}

export async function redispatchPayout(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission("payouts.operate");
  return runAdminForm(async () => {
    const { actor } = await requireAdminStepUp("payouts.operate");
    const payout = await services.admin.redispatchPayout(actor, field(formData, "payoutId"));
    return { status: "success", message: `Payout: ${payout.status}.` };
  });
}

export async function resyncPayout(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requirePermission("payouts.operate");
  return runAdminForm(async () => {
    await services.admin.resyncPayout(actor, field(formData, "payoutId"));
    return { status: "success", message: "Re-synced." };
  });
}

export async function replayWebhook(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission("webhooks.replay");
  return runAdminForm(async () => {
    const { actor } = await requireAdminStepUp("webhooks.replay");
    const status = await services.admin.replayWebhook(actor, field(formData, "eventId"));
    return { status: status === "failed" ? "error" : "success", message: `Replayed: ${status}.` };
  });
}

export async function updateSetting(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission("settings.manage");
  return runAdminForm(async () => {
    const { actor } = await requireAdminStepUp("settings.manage");
    const key = field(formData, "key");
    // A toggle that's off sends nothing, so read it as "".
    const parsed = fromInput(metaFor(key).kind, field(formData, "value"));
    if (!parsed.ok) return { status: "error", message: parsed.error };
    const seen = Number(field(formData, "version"));
    const version = await services.adminConfig.updateSetting(actor, key, parsed.value, Number.isInteger(seen) ? seen : undefined);
    // Public pages cache fees and limits.
    updateTag(SETTINGS_TAG);
    return { status: "success", message: `Saved. This is version ${version}.` };
  });
}

export async function updateRule(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission("risk.rules");
  return runAdminForm(async () => {
    const { actor } = await requireAdminStepUp("risk.rules");
    // One number field per parameter ("param.<name>").
    const params: Record<string, number> = {};
    for (const [name, value] of formData.entries()) {
      if (!name.startsWith("param.") || typeof value !== "string") continue;
      const n = Number(value.trim());
      if (!value.trim() || !Number.isFinite(n)) return { status: "error", message: `Enter a number for ${name.slice(6)}.` };
      params[name.slice(6)] = n;
    }
    const severity = field(formData, "severity");
    if (severity !== "low" && severity !== "medium" && severity !== "high") return { status: "error", message: "Choose a severity." };
    const seen = new Date(field(formData, "seenAt"));
    await services.admin.updateRule(actor, field(formData, "code"), {
      params,
      severity,
      active: field(formData, "active") === "on",
      seenAt: Number.isNaN(seen.getTime()) ? undefined : seen,
    });
    return { status: "success", message: "Rule saved." };
  });
}
