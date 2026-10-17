"use server";

import { updateTag } from "next/cache";
import type { FormState } from "@/lib/form-state";
import { requireRole } from "@/server/dal/session";
import { productChangeTags } from "@/server/lib/cache-tags";
import { field, runForm } from "@/server/lib/form";
import { services } from "@/server/services";

export async function approveProduct(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requireRole("staff", "super_admin");
  return runForm(async () => {
    productChangeTags(await services.productReview.approve(actor, field(formData, "productId"))).forEach((t) => updateTag(t));
    return { status: "success", message: "Published." };
  });
}

export async function rejectProduct(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await requireRole("staff", "super_admin");
  const note = field(formData, "note").trim();
  if (!note) return { status: "error", message: "Tell the creator what to fix." };
  return runForm(async () => {
    productChangeTags(await services.productReview.reject(actor, field(formData, "productId"), note)).forEach((t) => updateTag(t));
    return { status: "success", message: "Sent back to the creator." };
  });
}
