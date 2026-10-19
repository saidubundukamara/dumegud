import type { ChecklistEntry } from "./Checklist";
import { formatDateTime } from "@/lib/dates";
import type { KycStatusDTO } from "@/server/services/KycService";
import type { PayoutMethodDTO } from "@/server/services/PayoutMethodService";

/**
 * The three things between a creator and their money, in order: an approved ID, a mobile money
 * number in their name, and that number being cleared (new numbers pause for safety).
 */
export function withdrawReadiness(kyc: KycStatusDTO, method: PayoutMethodDTO | null): { ready: boolean; items: ChecklistEntry[] } {
  const idDone = kyc.status === "approved";
  const numberDone = Boolean(method);
  const openDone = method?.status === "active";

  const items: ChecklistEntry[] = [
    {
      key: "id",
      label: "Verify your ID",
      done: idDone,
      pending: kyc.status === "pending",
      href: "/dashboard/verification",
      detail:
        kyc.status === "pending"
          ? "We're checking your documents, usually within one working day."
          : kyc.status === "rejected" || kyc.status === "needs_more_info"
            ? "We need you to send your documents again."
            : idDone
              ? null
              : "A quick, one-time check that keeps your money safe.",
    },
    {
      key: "number",
      label: "Add your mobile money number",
      done: numberDone,
      href: idDone ? "/dashboard/payout-method" : undefined,
      detail: numberDone ? `${method!.providerLabel} ${method!.masked}` : idDone ? "It must be registered in your own name." : "You can add it once your ID is approved.",
    },
    {
      key: "open",
      label: "Withdrawals open",
      done: openDone,
      pending: method?.status === "cooling_off" || method?.status === "needs_recheck",
      detail:
        method?.status === "cooling_off" && method.cooldownUntil
          ? `New numbers are paused for your safety. Opens ${formatDateTime(method.cooldownUntil)}.`
          : method?.status === "needs_recheck"
            ? "Our team is checking your number. We'll email you."
            : null,
    },
  ];
  return { ready: idDone && openDone, items };
}
