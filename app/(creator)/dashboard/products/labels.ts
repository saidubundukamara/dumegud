import type { Route } from "next";
import { MINOR_PER_MAJOR } from "@/lib/money";

export const PRODUCT_STATUS_LABELS = {
  draft: "Draft",
  pending_review: "In review",
  published: "Live",
  unpublished: "Hidden",
  suspended: "Suspended",
} as const;

export const PRODUCT_STATUS_TONES = {
  draft: "neutral",
  pending_review: "warning",
  published: "success",
  unpublished: "neutral",
  suspended: "danger",
} as const;

/** Draft and hidden products are still being set up: the step-by-step flow applies to them. */
export function inSetup(status: keyof typeof PRODUCT_STATUS_LABELS) {
  return status === "draft" || status === "unpublished";
}

export function fileSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Minor units → the text the price input shows: 25000 → "250", 4999 → "49.99". */
export function priceText(minor: number) {
  return minor % MINOR_PER_MAJOR === 0 ? String(minor / MINOR_PER_MAJOR) : (minor / MINOR_PER_MAJOR).toFixed(2);
}

export function pricingOf(s: { productFeeBps: number; monimeCollectionBpsEstimate: number; minProductPriceMinor: number; maxProductPriceMinor: number }) {
  return { feeBps: s.productFeeBps, monimeBpsEstimate: s.monimeCollectionBpsEstimate, minMinor: s.minProductPriceMinor, maxMinor: s.maxProductPriceMinor };
}

/** A product's overview page, or one of its setup steps. */
export function productPath(productId: string, step?: "details" | "files" | "publish"): Route {
  return `/dashboard/products/${productId}${step ? `/${step}` : ""}` as Route;
}
