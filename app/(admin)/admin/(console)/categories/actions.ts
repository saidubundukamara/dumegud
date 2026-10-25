"use server";

import type { FormState } from "@/lib/form-state";
import { isUuid } from "@/lib/uuid";
import { requirePermission } from "@/server/dal/admin-session";
import { field } from "@/server/lib/form";
import { services } from "@/server/services";
import { runAdminForm } from "@/app/(admin)/admin/run-admin-form";

/** Create (no id) or edit a category. Unique slugs are enforced by the database. */
export async function saveCategory(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requirePermission("settings.manage");
  const id = field(formData, "id");
  if (id && !isUuid(id)) return { status: "error", message: "Reload the page and try again." };
  const name = field(formData, "name").trim();
  const slug = (field(formData, "slug").trim() || name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const position = Number(field(formData, "position") || "0");
  return runAdminForm(async () => {
    const saved = await services.adminConfig.saveCategory(actor, id || null, { name, slug, active: field(formData, "active") === "on", position: Number.isInteger(position) ? position : 0 });
    return { status: "success", message: id ? `Saved “${saved.name}”.` : `Added “${saved.name}”.` };
  });
}
