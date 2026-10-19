import "server-only";
import type { JournalInput } from "@/server/repositories/LedgerRepository";

// Double-entry journals (implementation.md §3.4, as built). Debits are positive, credits negative;
// every journal sums to zero. Accounts:
//
//   platform_cash             asset      money in the DuMeGud platform Monime account
//   creator_wallet:{userId}   asset      money sitting in the creator's own Monime account
//   creator_payable:{userId}  liability  everything owed to the creator (until paid out)
//   platform_revenue          income     platform fees earned
//   platform_fee_variance     expense    Monime fee corrections the platform absorbs
//
// So: platform_cash mirrors the platform account's balance, creator_wallet mirrors each creator's
// Monime balance (the withdrawal gate in Phase 6), and creator_payable is what we owe overall.

export const accounts = {
  platformCash: "platform_cash",
  platformRevenue: "platform_revenue",
  feeVariance: "platform_fee_variance",
  creatorPayable: (creatorId: string) => `creator_payable:${creatorId}`,
  creatorWallet: (creatorId: string) => `creator_wallet:${creatorId}`,
};

type Line = JournalInput["lines"][number];

function journal(input: Omit<JournalInput, "lines">, lines: Line[]): JournalInput {
  const nonZero = lines.filter((l) => l.amountMinor !== 0);
  for (const l of nonZero) {
    if (!Number.isSafeInteger(l.amountMinor)) throw new Error(`ledger: non-integer amount on ${l.account}`);
  }
  const sum = nonZero.reduce((s, l) => s + l.amountMinor, 0);
  if (sum !== 0) throw new Error(`ledger: journal ${input.idempotencyKey} is unbalanced by ${sum}`);
  if (!nonZero.length) throw new Error(`ledger: journal ${input.idempotencyKey} has no lines`);
  return { ...input, lines: nonZero };
}

/** Money arrived in the platform account; recognise what we owe the creator and our fee. */
export function settleJournal(p: { id: string; creatorId: string; arrivedMinor: number; creatorNetMinor: number; platformFeeMinor: number }) {
  return journal({ idempotencyKey: `settle:${p.id}`, kind: "settle", paymentId: p.id }, [
    { account: accounts.platformCash, amountMinor: p.arrivedMinor },
    { account: accounts.creatorPayable(p.creatorId), amountMinor: -p.creatorNetMinor },
    { account: accounts.platformRevenue, amountMinor: -p.platformFeeMinor },
  ]);
}

/** The creator's net moved from the platform account to their wallet (still owed until payout). */
export function transferJournal(p: { id: string; creatorId: string; creatorNetMinor: number }) {
  return journal({ idempotencyKey: `transfer:${p.id}`, kind: "transfer", paymentId: p.id }, [
    { account: accounts.creatorWallet(p.creatorId), amountMinor: p.creatorNetMinor },
    { account: accounts.platformCash, amountMinor: -p.creatorNetMinor },
  ]);
}

/**
 * A fee reported after the split was frozen on an estimate. The creator keeps what they were
 * given; the platform absorbs the difference (positive delta = Monime took more than estimated).
 */
export function varianceJournal(p: { id: string; monimePaymentId: string; deltaMinor: number }) {
  return journal(
    { idempotencyKey: `variance:${p.monimePaymentId}`, kind: "fee_variance", paymentId: p.id, memo: "reported fee differs from estimate" },
    [
      { account: accounts.feeVariance, amountMinor: p.deltaMinor },
      { account: accounts.platformCash, amountMinor: -p.deltaMinor },
    ],
  );
}

/**
 * Money left the creator's Monime account: the amount to their phone plus Monime's payout fee
 * (charged on top). Both reduce what we owe them.
 */
export function payoutJournal(p: { id: string; creatorId: string; amountMinor: number; feeMinor: number }) {
  const total = p.amountMinor + p.feeMinor;
  return journal({ idempotencyKey: `payout:${p.id}`, kind: "payout", paymentId: null, memo: `payout ${p.id}` }, [
    { account: accounts.creatorPayable(p.creatorId), amountMinor: total },
    { account: accounts.creatorWallet(p.creatorId), amountMinor: -total },
  ]);
}

/**
 * A creator closing their account gave up a remainder too small to withdraw. It moved from their
 * Monime account to the platform account, so we no longer owe it and it becomes platform income.
 */
export function forfeitJournal(p: { deletionId: string; creatorId: string; amountMinor: number }) {
  return journal({ idempotencyKey: `forfeit:${p.deletionId}`, kind: "forfeit", paymentId: null, memo: "remainder given up on account deletion" }, [
    { account: accounts.creatorPayable(p.creatorId), amountMinor: p.amountMinor },
    { account: accounts.creatorWallet(p.creatorId), amountMinor: -p.amountMinor },
    { account: accounts.platformCash, amountMinor: p.amountMinor },
    { account: accounts.platformRevenue, amountMinor: -p.amountMinor },
  ]);
}
