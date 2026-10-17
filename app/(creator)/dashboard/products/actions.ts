"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import type { FormState } from "@/lib/form-state";
import { verifySession } from "@/server/dal/session";
import { productChangeTags } from "@/server/lib/cache-tags";
import { toActionResult, ValidationError, type ActionResult } from "@/server/lib/errors";
import { field, invalidForm, runForm } from "@/server/lib/form";
import { logger } from "@/server/lib/logger";
import { services } from "@/server/services";
import type { ProductChange } from "@/server/services/ProductService";
import { productSchema, uploadRequestSchema } from "@/server/validation/product";

const refresh = (change: ProductChange) => productChangeTags(change).forEach((tag) => updateTag(tag));

function parseProduct(formData: FormData) {
  return productSchema.safeParse({
    title: field(formData, "title"),
    description: field(formData, "description"),
    categoryId: field(formData, "categoryId"),
    price: field(formData, "price"),
    licenseType: field(formData, "licenseType"),
    licenseText: field(formData, "licenseText"),
  });
}

export async function createProduct(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await verifySession();
  const parsed = parseProduct(formData);
  if (!parsed.success) return invalidForm(parsed.error);
  let productId: string | null = null;
  const result = await runForm(async () => {
    const change = await services.products.create(actor, parsed.data);
    refresh(change);
    productId = change.productId;
    return { status: "success" };
  });
  if (!productId) return result;
  redirect(`/dashboard/products/${productId}`);
}

export async function updateProduct(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await verifySession();
  const parsed = parseProduct(formData);
  if (!parsed.success) return invalidForm(parsed.error);
  return runForm(async () => {
    refresh(await services.products.update(actor, field(formData, "productId"), parsed.data));
    return { status: "success", message: "Saved." };
  });
}

export async function submitProduct(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await verifySession();
  return runForm(async () => {
    refresh(await services.products.submitForReview(actor, field(formData, "productId"), field(formData, "ownership") === "on"));
    return { status: "success", message: "Submitted. We'll review it shortly; you'll see it go live here." };
  });
}

export async function unpublishProduct(_prev: FormState, formData: FormData): Promise<FormState> {
  const { actor } = await verifySession();
  return runForm(async () => {
    refresh(await services.products.unpublish(actor, field(formData, "productId")));
    return { status: "success", message: "Unpublished. Existing buyers keep their downloads." };
  });
}

/** Upload step 1: presigned PUT. */
export async function requestProductUpload(input: {
  productId: string;
  kind: "file" | "preview_image";
  filename: string;
  size: number;
}): Promise<ActionResult<{ assetId: string; url: string; contentType: string }>> {
  const { actor } = await verifySession();
  return toActionResult(async () => {
    const parsed = uploadRequestSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError("That upload isn't valid.");
    return services.products.requestUpload(actor, parsed.data);
  });
}

/** Upload step 2: verify (size + magic bytes); hash large files after the response. */
export async function confirmProductUpload(assetId: string): Promise<ActionResult<null>> {
  const { actor } = await verifySession();
  return toActionResult(async () => {
    refresh(await services.products.confirmUpload(actor, String(assetId)));
    after(() => services.products.hashAsset(String(assetId)).catch((err) => logger.warn("asset hash failed", { err })));
    return null;
  });
}

export async function deleteProductAsset(assetId: string): Promise<ActionResult<null>> {
  const { actor } = await verifySession();
  return toActionResult(async () => {
    refresh(await services.products.deleteAsset(actor, String(assetId)));
    return null;
  });
}
