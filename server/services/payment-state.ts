import "server-only";
import type { PaymentStatus } from "@/server/db/schema";

/**
 * Payment state machine (implementation.md Phase 4). For each target status, the statuses it
 * may be entered from. Repositories apply transitions as
 * `UPDATE … WHERE id = ? AND status = ANY(from)`, so a stale or out-of-order event can never
 * move a payment backwards (a late `expired` after `succeeded` simply matches no row).
 *
 *   created → pending → succeeded → reversed
 *                    ↘ failed | canceled | expired
 *   pending → under_review → succeeded | failed
 *   succeeded → under_review                     (limit postcheck, only before any transfer)
 *   failed | canceled | expired → under_review   (money arrived after we gave up: staff review)
 */
export const ALLOWED_FROM: Record<PaymentStatus, readonly PaymentStatus[]> = {
  created: [],
  pending: ["created"],
  succeeded: ["created", "pending", "under_review"],
  failed: ["created", "pending", "under_review"],
  canceled: ["created", "pending"],
  expired: ["created", "pending"],
  reversed: ["succeeded"],
  // `succeeded` → review only before the transfer (limit postcheck holds); callers check that.
  under_review: ["created", "pending", "succeeded", "failed", "canceled", "expired"],
};

export const TERMINAL_UNPAID: readonly PaymentStatus[] = ["failed", "canceled", "expired"];

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return ALLOWED_FROM[to].includes(from);
}
