import "server-only";
import type { FailureDetail, MonimeFee, Payment } from "./types";

// Tolerant readers for the Monime fields that have bitten us in production (ib4me).

/**
 * Total of a `fees` field in minor units, or null when nothing was reported. Sums the whole
 * array (never `[0]`). Also accepts the legacy `{ total }` object. Null is NOT zero: a missing
 * fee must fall back to the estimate, not to "free".
 */
export function sumMonimeFees(fees: unknown): number | null {
  if (fees == null) return null;
  if (Array.isArray(fees)) {
    let total = 0;
    let seen = false;
    for (const entry of fees as MonimeFee[]) {
      const value = entry?.amount?.value;
      if (typeof value === "number" && Number.isFinite(value)) {
        total += value;
        seen = true;
      }
    }
    return seen ? Math.max(0, Math.trunc(total)) : null;
  }
  if (typeof fees === "object") {
    const total = (fees as { total?: unknown }).total;
    if (typeof total === "number" && Number.isFinite(total)) return Math.max(0, Math.trunc(total));
  }
  return null;
}

/** The checkout session a payment belongs to: `ownershipGraph.owner` first, legacy field second. */
export function resolveCheckoutSessionId(payment: Pick<Payment, "ownershipGraph" | "checkoutSessionId">): string | null {
  const owner = payment.ownershipGraph?.owner;
  if (owner?.id && (!owner.type || owner.type === "checkout_session")) return owner.id;
  return payment.checkoutSessionId ?? null;
}

/** One safe string for a failure, whatever shape Monime sent (object, string, or nothing). */
export function describeMonimeFailure(
  source: { failureDetail?: FailureDetail | string | null; failureReason?: string | null } | null | undefined,
  fallback = "Failed",
): string {
  const detail = source?.failureDetail;
  if (detail && typeof detail === "object") {
    const message = typeof detail.message === "string" ? detail.message.trim() : "";
    const code = typeof detail.code === "string" ? detail.code.trim() : "";
    if (message && code) return `${message} (${code})`.slice(0, 300);
    if (message || code) return (message || code).slice(0, 300);
  } else if (typeof detail === "string" && detail.trim()) {
    return detail.trim().slice(0, 300);
  }
  if (typeof source?.failureReason === "string" && source.failureReason.trim()) return source.failureReason.trim().slice(0, 300);
  return fallback;
}
