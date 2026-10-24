import "server-only";
import { availableBalanceMinor, type MonimeClient } from "@/server/integrations/monime";
import type { ObjectStorage } from "@/server/integrations/r2/storage";
import { creatorTag } from "@/server/lib/cache-tags";
import { logger } from "@/server/lib/logger";
import type { AuthTokenRepository } from "@/server/repositories/AuthTokenRepository";
import type { CreatorProfileRepository } from "@/server/repositories/CreatorProfileRepository";
import type { CreatorWalletRepository } from "@/server/repositories/CreatorWalletRepository";
import type { LedgerRepository } from "@/server/repositories/LedgerRepository";
import type { PaymentRepository } from "@/server/repositories/PaymentRepository";
import type { PayoutMethodRepository } from "@/server/repositories/PayoutMethodRepository";
import type { PayoutRepository } from "@/server/repositories/PayoutRepository";
import type { ProductRepository } from "@/server/repositories/ProductRepository";
import type { JobContext, JobResult } from "./JobService";
import { accounts } from "./ledger";
import type { PayoutService } from "./PayoutService";
import type { PlatformSettingsService } from "./PlatformSettingsService";
import type { RiskService } from "./RiskService";
import type { SettlementService } from "./SettlementService";
import type { TransferService } from "./TransferService";
import type { WalletService } from "./WalletService";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** The cron keeps retrying wallet provisioning past the request-time limit (`WALLET_MAX_ATTEMPTS`). */
export const WALLET_CRON_MAX_ATTEMPTS = 10;
/** Definitive transfer failures after which a payment needs staff (Admin → retry transfer). */
export const TRANSFER_CRON_MAX_ATTEMPTS = 5;
/** `risk_alerts.subject_id` for alerts about the platform account itself. */
export const PLATFORM_SUBJECT_ID = "00000000-0000-0000-0000-000000000000";

const BATCH = 50;

type ReconciliationRepos = {
  payments: PaymentRepository;
  wallets: CreatorWalletRepository;
  payouts: PayoutRepository;
  ledger: LedgerRepository;
  payoutMethods: PayoutMethodRepository;
  authTokens: AuthTokenRepository;
  products: ProductRepository;
  profiles: CreatorProfileRepository;
};

export type ReconciliationServiceDeps = {
  repos: ReconciliationRepos;
  wallet: Pick<WalletService, "provisionForCreator">;
  settlement: Pick<SettlementService, "settleWithEstimate" | "resync">;
  transfers: Pick<TransferService, "settleToCreator" | "refreshPending">;
  payouts: Pick<PayoutService, "syncFromMonime" | "dispatch">;
  risk: Pick<RiskService, "raise">;
  settings: Pick<PlatformSettingsService, "get">;
  monime: MonimeClient;
  platformAccountId: () => string;
  storage: Pick<ObjectStorage, "deleteObject"> | null;
  buckets: { products: string; public: string };
};

/**
 * The Phase 9 safety net: finds money that got stuck (a lost webhook, a transfer or payout with
 * no outcome, a wallet Monime never created) and pushes it through the same idempotent service
 * paths the webhooks and staff use. One method per cron job; each works through a bounded batch,
 * isolates failures per row, and leaves the rest to the next run once its time is up.
 */
export class ReconciliationService {
  private readonly repos: ReconciliationRepos;

  constructor(private readonly deps: ReconciliationServiceDeps) {
    this.repos = deps.repos;
  }

  /** Wallets Monime never created: retry with backoff (2^attempts minutes, at most 6 hours). */
  async provisionWallets(ctx: JobContext): Promise<JobResult> {
    const due = (await this.repos.wallets.listRetryable(WALLET_CRON_MAX_ATTEMPTS, BATCH)).filter(
      (w) => !w.lastAttemptAt || w.lastAttemptAt.getTime() + Math.min(2 ** w.attempts * MIN, 6 * HOUR) <= ctx.now.getTime(),
    );
    return this.each(ctx, "provision-wallets", due, async (w) => {
      await this.deps.wallet.provisionForCreator(w.userId);
    });
  }

  /**
   * Settled payments whose money hasn't reached the creator: settle on the estimated fee once
   * Monime's fee is 15 minutes late, then resolve pending transfers and retry failed ones.
   */
  async retryTransfers(ctx: JobContext): Promise<JobResult> {
    const awaitingFee = await this.repos.payments.listAwaitingFee(this.ago(ctx, 15 * MIN), BATCH);
    const fees = await this.each(ctx, "retry-transfers", awaitingFee, (p) => this.deps.settlement.settleWithEstimate(p.id));

    const stuck = await this.repos.payments.listTransferRetry(this.ago(ctx, 2 * MIN), TRANSFER_CRON_MAX_ATTEMPTS, BATCH);
    const transfers = await this.each(ctx, "retry-transfers", stuck, async (p) => {
      if (p.transferStatus === "pending") await this.deps.transfers.refreshPending(p.id, ctx.now);
      else await this.deps.transfers.settleToCreator(p.id);
    });
    return { processed: fees.processed + transfers.processed, errors: fees.errors + transfers.errors };
  }

  /**
   * Checkouts with no verdict after 15 minutes (a lost webhook): ask Monime and apply its answer
   * through the normal settlement path. Sessions Monime still calls open but that expired over
   * 15 minutes ago are marked expired.
   */
  async reconcilePayments(ctx: JobContext): Promise<JobResult> {
    const stale = await this.repos.payments.listStalePending(this.ago(ctx, 15 * MIN), BATCH);
    const changed = new Set<string>();
    const result = await this.each(ctx, "reconcile-payments", stale, async (p) => {
      const after = await this.deps.settlement.resync(p.id, { source: "cron", expireBefore: this.ago(ctx, 15 * MIN) });
      if (after && after.status !== p.status) changed.add(p.creatorId);
    });
    return { ...result, tags: await this.creatorTags(changed) };
  }

  /** Payouts with no outcome after 10 minutes: re-send `requested` (same key), read `processing`. */
  async reconcilePayouts(ctx: JobContext): Promise<JobResult> {
    const stale = await this.repos.payouts.listStale(this.ago(ctx, 10 * MIN), BATCH);
    return this.each(ctx, "reconcile-payouts", stale, async (p) => {
      if (p.status === "requested") await this.deps.payouts.dispatch(p.id);
      else await this.deps.payouts.syncFromMonime(p.id);
    });
  }

  /**
   * Compare the ledger with Monime's live balances: every creator wallet that moved in the last
   * day, and the platform account. An account with money in flight (an unsettled fee, a transfer
   * or payout without an outcome) is skipped: the two sides legitimately differ until it lands.
   * Drift raises a LEDGER_DRIFT alert for staff.
   */
  async ledgerDrift(ctx: JobContext): Promise<JobResult> {
    const { ledgerDriftToleranceMinor: tolerance } = await this.deps.settings.get();
    const drifted: Record<string, number> = {};
    const creatorIds = await this.repos.ledger.walletsChangedSince(this.ago(ctx, DAY), 500);

    const creators = await this.each(ctx, "ledger-drift", creatorIds, async (creatorId) => {
      const wallet = await this.repos.wallets.findByUserId(creatorId);
      if (wallet?.status !== "active" || !wallet.monimeFinancialAccountId) return;
      if ((await this.repos.payments.hasTransferInFlight(creatorId)) || (await this.repos.payouts.findOpenForCreator(creatorId))) return;
      const ledger = await this.repos.ledger.balance(accounts.creatorWallet(creatorId));
      const live = await this.liveBalance(wallet.monimeFinancialAccountId);
      if (Math.abs(live - ledger) <= tolerance) return;
      drifted[creatorId] = live - ledger;
      await this.alertDrift({ subjectType: "creator", subjectId: creatorId, creatorId, accountId: wallet.monimeFinancialAccountId, ledger, live });
    });

    const platform = await this.each(ctx, "ledger-drift", [this.deps.platformAccountId()], async (accountId) => {
      if (await this.repos.payments.platformInFlight()) return;
      const ledger = await this.repos.ledger.balance(accounts.platformCash);
      const live = await this.liveBalance(accountId);
      if (Math.abs(live - ledger) <= tolerance) return;
      drifted.platform = live - ledger;
      await this.alertDrift({ subjectType: "platform", subjectId: PLATFORM_SUBJECT_ID, creatorId: null, accountId, ledger, live });
    });

    return {
      processed: creators.processed + platform.processed,
      errors: creators.errors + platform.errors,
      detail: { drifted: Object.keys(drifted).length },
    };
  }

  /**
   * Daily housekeeping: activate payout methods whose cooldown passed, purge expired sign-in and
   * reset tokens, and delete the stored files of erased creators' products once no buyer can
   * download them any more. (Entitlement expiry is enforced when read; KYC documents are deleted
   * at erasure.)
   */
  async cleanup(ctx: JobContext): Promise<JobResult> {
    const promoted = await this.repos.payoutMethods.promoteAllCooled(ctx.now);
    const tokens = await this.repos.authTokens.purgeExpired(ctx.now, this.ago(ctx, DAY));
    let files = { processed: 0, errors: 0 };
    const storage = this.deps.storage;
    if (storage) {
      const assets = await this.repos.products.listPurgeableAssets(ctx.now, BATCH);
      files = await this.each(ctx, "cleanup", assets, async (asset) => {
        const bucket = asset.kind === "file" ? this.deps.buckets.products : this.deps.buckets.public;
        await storage.deleteObject(bucket, asset.r2Key);
        await this.repos.products.updateAsset(asset.id, { purgedAt: ctx.now });
      });
    }
    return {
      processed: promoted + tokens + files.processed,
      errors: files.errors,
      detail: { payoutMethodsActivated: promoted, tokensPurged: tokens, filesPurged: files.processed },
    };
  }

  // ── Internals ─────────────────────────────────────────────────────────────────

  /** Run `fn` per row until the time budget is used up; a failing row is logged, never fatal. */
  private async each<T>(ctx: JobContext, job: string, rows: T[], fn: (row: T) => Promise<unknown>) {
    let processed = 0;
    let errors = 0;
    for (const row of rows) {
      if (!ctx.hasTime()) break;
      try {
        await fn(row);
        processed++;
      } catch (err) {
        errors++;
        logger.error("job row failed", { job, err });
      }
    }
    return { processed, errors };
  }

  private async liveBalance(accountId: string): Promise<number> {
    const live = availableBalanceMinor(await this.deps.monime.getFinancialAccount(accountId));
    // Unknown is an error to retry next run, not drift.
    if (live === null) throw new Error("live balance unavailable");
    return live;
  }

  private async alertDrift(a: { subjectType: "creator" | "platform"; subjectId: string; creatorId: string | null; accountId: string; ledger: number; live: number }) {
    logger.error("ledger drift", { subjectType: a.subjectType, ledgerMinor: a.ledger, liveMinor: a.live });
    await this.deps.risk.raise({
      ruleCode: "LEDGER_DRIFT",
      subjectType: a.subjectType,
      subjectId: a.subjectId,
      creatorId: a.creatorId,
      // A bookkeeping signal, not a judgement about the creator: never raises their risk tier.
      severity: "medium",
      evidence: { accountId: a.accountId, ledgerMinor: a.ledger, liveMinor: a.live, driftMinor: a.live - a.ledger },
    });
  }

  private async creatorTags(creatorIds: Set<string>): Promise<string[]> {
    const tags: string[] = [];
    for (const id of creatorIds) {
      const profile = await this.repos.profiles.findByUserId(id);
      if (profile) tags.push(creatorTag(profile.id));
    }
    return tags;
  }

  private ago(ctx: JobContext, ms: number): Date {
    return new Date(ctx.now.getTime() - ms);
  }
}
