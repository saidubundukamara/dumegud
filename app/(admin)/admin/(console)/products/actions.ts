"use server";

import { updateTag } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { requirePermission } from "@/server/dal/admin-session";
import { productChangeTags } from "@/server/lib/cache-tags";
import { field } from "@/server/lib/form";
import { runAdminForm } from "@/app/(admin)/admin/run-admin-form";
import { services } from "@/server/services";

export async function approveProduct(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requirePermission("products.review");
  return runAdminForm(async () => {
    const version = new Date(field(formData, "version"));
    if (Number.isNaN(version.getTime())) return { status: "error", message: "Reload the page and review this product again." };
    productChangeTags(await services.productReview.approve(actor, field(formData, "productId"), version)).forEach((t) => updateTag(t));
    return { status: "success", message: "Published." };
  });
}

export async function rejectProduct(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requirePermission("products.review");
  const note = field(formData, "note").trim();
  if (!note) return { status: "error", message: "Tell the creator what to fix." };
  return runAdminForm(async () => {
    productChangeTags(await services.productReview.reject(actor, field(formData, "productId"), note)).forEach((t) => updateTag(t));
    return { status: "success", message: "Sent back to the creator." };
  });
}
