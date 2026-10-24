import "server-only";
import { describeMonimeFailure, MonimeApiError, type InternalTransfer, type MonimeClient } from "@/server/integrations/monime";
import { logger } from "@/server/lib/logger";
import type { CreatorWalletRepository } from "@/server/repositories/CreatorWalletRepository";
import type { LedgerRepository } from "@/server/repositories/LedgerRepository";
import type { PaymentRepository } from "@/server/repositories/PaymentRepository";
import { transferJournal } from "./ledger";
import { runInTransaction } from "./transaction";

export type TransferOutcome = "completed" | "pending" | "failed" | "skipped";

type TransferRepos = { payments: PaymentRepository; wallets: CreatorWalletRepository; ledger: LedgerRepository };

export type TransferServiceDeps = {
  repos: TransferRepos;
  monime: MonimeClient;
  platformAccountId: () => string;
  transaction?: typeof runInTransaction;
  sleep?: (ms: number) => Promise<void>;
  /** Short in-request polling for the transfer to complete before handing over to the cron. */
  pollAttempts?: number;
  now?: () => Date;
};

/** A claim with no transfer id is only taken over once untouched this long (request in flight). */
const STALE_CLAIM_MS = 2 * 60_000;

/**
 * Moves a settled payment's creator net from the platform account to the creator's wallet
 * (implementation.md Phase 4). Exactly once per payment:
 * - `claimTransfer` lets one caller in (none|failed → pending) and only before the split freezes;
 * - the Monime idempotency key is `transfer-{paymentId}-{definitiveFailures}`. Network errors and
 *   5xx keep the same key, so a request that did go through is replayed, not duplicated; a
 *   transfer Monime definitively failed gets a fresh key (replaying the old one would only
 *   return the same failure).
 */
export class TransferService {
  private readonly repos: TransferRepos;
  private readonly monime: MonimeClient;
  private readonly platformAccountId: () => string;
  private readonly transaction: typeof runInTransaction;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => Date;
  private readonly pollAttempts: number;

  constructor(deps: TransferServiceDeps) {
    this.repos = deps.repos;
    this.monime = deps.monime;
    this.platformAccountId = deps.platformAccountId;
    this.transaction = deps.transaction ?? runInTransaction;
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.pollAttempts = deps.pollAttempts ?? 3;
    this.now = deps.now ?? (() => new Date());
  }

  async settleToCreator(paymentId: string): Promise<TransferOutcome> {
    const payment = await this.repos.payments.findById(paymentId);
    if (!payment || payment.status !== "succeeded" || payment.creatorNetMinor === null || payment.settlementFrozen) {
      return "skipped";
    }
    if (payment.transferStatus === "pending" || payment.transferStatus === "completed") return "skipped";

    const wallet = await this.repos.wallets.findByUserId(payment.creatorId);
    if (!wallet || wallet.status !== "active" || !wallet.monimeFinancialAccountId) {
      // Frozen or not provisioned: money stays in the platform account (still owed in the ledger).
      logger.warn("transfer skipped: creator wallet not active", { paymentId, walletStatus: wallet?.status ?? "missing" });
      return "skipped";
    }

    const claimed = await this.repos.payments.claimTransfer(paymentId);
    if (!claimed) return "skipped"; // someone else has it, or the wallet was frozen in between

    if (claimed.creatorNetMinor! <= 0) {
      // Monime rejects zero-value transfers; there is nothing to move. We hold the claim.
      await this.repos.payments.update(paymentId, { transferStatus: "completed", settlementFrozen: true });
      return "completed";
    }

    let transfer: InternalTransfer;
    try {
      transfer = await this.monime.createInternalTransfer(
        {
          amount: { currency: "SLE", value: claimed.creatorNetMinor! },
          sourceFinancialAccount: { id: this.platformAccountId() },
          destinationFinancialAccount: { id: wallet.monimeFinancialAccountId },
          description: "DuMeGud support payout",
          metadata: { paymentId, type: "creator_settlement" },
        },
        `transfer-${paymentId}-${claimed.transferAttempts}`,
      );
    } catch (err) {
      const definitive = err instanceof MonimeApiError && !err.retryable;
      // Guarded by our attempt: if a stale-claim takeover already moved on, leave its attempt alone.
      const failed = await this.repos.payments.markTransferFailed(
        paymentId,
        { attempt: claimed.transferAttempts },
        definitive,
        err instanceof MonimeApiError ? `${err.code}: ${err.message}` : "transfer request failed",
      );
      logger.error("creator transfer failed to start", { paymentId, definitive, err });
      return failed ? "failed" : "skipped";
    }

    await this.repos.payments.update(paymentId, { transferId: transfer.id });
    for (let i = 0; i < this.pollAttempts && (transfer.status === "pending" || transfer.status === "processing"); i++) {
      await this.sleep(1000);
      transfer = await this.monime.getInternalTransfer(transfer.id).catch(() => transfer);
    }
    return this.apply(paymentId, transfer);
  }

  /**
   * For the retry cron (Phase 9): resolve a transfer left `pending`. Reads the stored transfer
   * first; if the request never got an id back, re-sends it with the same idempotency key.
   */
  async refreshPending(paymentId: string, now: Date = this.now()): Promise<TransferOutcome> {
    const payment = await this.repos.payments.findById(paymentId);
    if (!payment || payment.transferStatus !== "pending") return "skipped";
    if (!payment.transferId) {
      // Same attempt count → same key. Only a claim untouched for a while: a fresh one is in flight.
      const released = await this.repos.payments.releaseStaleTransferClaim(paymentId, new Date(now.getTime() - STALE_CLAIM_MS));
      return released ? this.settleToCreator(paymentId) : "pending";
    }
    return this.apply(paymentId, await this.monime.getInternalTransfer(payment.transferId));
  }

  private async apply(paymentId: string, transfer: InternalTransfer): Promise<TransferOutcome> {
    if (transfer.status === "completed") {
      await this.transaction(async (tx) => {
        const payment = await this.repos.payments.lockById(paymentId, tx);
        if (!payment || payment.settlementFrozen) return;
        await this.repos.payments.update(paymentId, { transferStatus: "completed", settlementFrozen: true, lastError: null }, tx);
        await this.repos.ledger.postJournal(
          transferJournal({ id: payment.id, creatorId: payment.creatorId, creatorNetMinor: payment.creatorNetMinor! }),
          tx,
        );
      });
      return "completed";
    }
    if (transfer.status === "failed") {
      // One bump per failed transfer: a replayed failure (or one for an older transfer) matches nothing.
      const failed = await this.repos.payments.markTransferFailed(
        paymentId,
        { transferId: transfer.id },
        true,
        describeMonimeFailure(transfer, "Transfer failed"),
      );
      if (failed) logger.error("creator transfer failed", { paymentId, transferId: transfer.id });
      return failed ? "failed" : "skipped";
    }
    return "pending"; // the retry-transfers cron picks it up
  }
}
