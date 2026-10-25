"use server";

import type { FormState } from "@/lib/form-state";
import { requireAdminStepUp, requirePermission } from "@/server/dal/admin-session";
import { field } from "@/server/lib/form";
import { runAdminForm } from "@/app/(admin)/admin/run-admin-form";
import { services } from "@/server/services";

// Role editing (roles.manage + step-up). The service refuses editing super_admin, editing a role
// you hold, and adding or removing permissions you don't have yourself.

export async function createRole(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission("roles.manage");
  const values = { key: field(formData, "key"), name: field(formData, "name"), description: field(formData, "description") };
  return runAdminForm(async () => {
    const { actor } = await requireAdminStepUp("roles.manage");
    await services.adminAccounts.createRole(actor, { ...values, permissions: formData.getAll("permission").map(String) });
    return { status: "success", message: `Role ${values.name.trim()} created.` };
  }, values);
}

export async function updateRole(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission("roles.manage");
  return runAdminForm(async () => {
    const { actor } = await requireAdminStepUp("roles.manage");
    await services.adminAccounts.updateRole(actor, field(formData, "roleId"), {
      name: field(formData, "name"),
      description: field(formData, "description"),
      permissions: formData.getAll("permission").map(String),
    });
    return { status: "success", message: "Saved. It applies on everyone's next request." };
  });
}

export async function deleteRole(_prev: FormState, formData: FormData): Promise<FormState> {
  await requirePermission("roles.manage");
  return runAdminForm(async () => {
    const { actor } = await requireAdminStepUp("roles.manage");
    await services.adminAccounts.deleteRole(actor, field(formData, "roleId"));
    return { status: "success", message: "Role deleted." };
  });
}
