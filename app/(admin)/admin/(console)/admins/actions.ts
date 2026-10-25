"use server";

import type { AdminStatus } from "@/server/db/schema";
import type { FormState } from "@/lib/form-state";
import { requireAdminStepUp, requirePermission } from "@/server/dal/admin-session";
import { enforceRateLimit } from "@/server/lib/rate-limit";
import { field } from "@/server/lib/form";
import { runAdminForm } from "@/app/(admin)/admin/run-admin-form";
import { services } from "@/server/services";

// Admin management (admins.manage). Every change needs step-up and is audited by the service,
// which also enforces the no-self-change, grant-only-what-you-hold and last-super-admin rules.

const STATUSES: AdminStatus[] = ["active", "suspended", "disabled"];

export async function inviteAdmin(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission("admins.manage");
  const email = field(formData, "email");
  return runAdminForm(
    async () => {
      const { actor } = await requireAdminStepUp("admins.manage");
      await enforceRateLimit("admin-invite:admin", actor.adminId);
      await services.adminAccounts.invite(actor, { email, roleIds: formData.getAll("roleId").map(String) });
      return { status: "success", message: `Invite sent to ${email.trim().toLowerCase()}. The link works for 72 hours.` };
    },
    { email },
  );
}

export async function revokeAdminInvite(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission("admins.manage");
  return runAdminForm(async () => {
    const { actor } = await requireAdminStepUp("admins.manage");
    await services.adminAccounts.revokeInvite(actor, field(formData, "inviteId"));
    return { status: "success", message: "Invite withdrawn." };
  });
}

export async function setAdminStatus(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission("admins.manage");
  const status = field(formData, "status") as AdminStatus;
  if (!STATUSES.includes(status)) return { status: "error", message: "Choose a status." };
  return runAdminForm(async () => {
    const { actor } = await requireAdminStepUp("admins.manage");
    await services.adminAccounts.setStatus(actor, field(formData, "adminId"), status, field(formData, "note"));
    return { status: "success", message: status === "active" ? "Active again." : `${status === "suspended" ? "Suspended" : "Disabled"}. They’re signed out everywhere.` };
  });
}

export async function setAdminRoles(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission("admins.manage");
  return runAdminForm(async () => {
    const { actor } = await requireAdminStepUp("admins.manage");
    await services.adminAccounts.setRoles(actor, field(formData, "adminId"), formData.getAll("roleId").map(String));
    return { status: "success", message: "Roles saved. They need to sign in again." };
  });
}

export async function unlockAdmin(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission("admins.manage");
  return runAdminForm(async () => {
    const { actor } = await requireAdminStepUp("admins.manage");
    await services.adminAccounts.unlock(actor, field(formData, "adminId"));
    return { status: "success", message: "Unlocked. They can sign in again now." };
  });
}

/** Break-glass: they set up a new authenticator at their next sign-in. */
export async function resetAdminTotp(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission("admins.manage");
  const reason = field(formData, "note").trim();
  if (!reason) return { status: "error", message: "Give a reason. The audit log keeps it." };
  return runAdminForm(async () => {
    const { actor } = await requireAdminStepUp("admins.manage");
    await services.adminAccounts.resetSecondFactor(actor, field(formData, "adminId"), reason);
    return { status: "success", message: "Reset. They’re signed out and set up a new authenticator when they next sign in." };
  });
}
