import "server-only";
import { formatSLE } from "@/lib/money";
import { maskMsisdn, payoutFee } from "@/lib/phone";
import type { Payout } from "@/server/db/schema";
import type { EmailService } from "@/server/integrations/email";
import { payoutResultTemplate } from "@/server/integrations/email/templates";
import { describeMonimeFailure, MonimeApiError, sumMonimeFees, type MonimeClient, type Payout as MonimePayout } from "@/server/integrations/monime";
import { unwrapResult } from "@/server/integrations/monime/client";
import type { MonimeEvent } from "@/server/integrations/monime/webhook";
import { decryptField } from "@/server/lib/crypto";
import { ConflictError, ExternalServiceError, ForbiddenError, NotFoundError, ValidationError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import { isUniqueViolation } from "@/server/repositories/BaseRepository";
import type { AccountDeletionRepository } from "@/server/repositories/AccountDeletionRepository";
import type { CreatorProfileRepository } from "@/server/repositories/CreatorProfileRepository";
import type { CreatorWalletRepository } from "@/server/repositories/CreatorWalletRepository";
import type { LedgerRepository } from "@/server/repositories/LedgerRepository";
import type { PayoutMethodRepository } from "@/server/repositories/PayoutMethodRepository";
import type { PayoutRepository } from "@/server/repositories/PayoutRepository";
import type { UserRepository } from "@/server/repositories/UserRepository";
import { isStaff, type Actor } from "./actor";
import type { BalanceService } from "./BalanceService";
import type { KycService } from "./KycService";
import { accounts, payoutJournal } from "./ledger";
import type { PayoutMethodService } from "./PayoutMethodService";
import type { PlatformSettingsService } from "./PlatformSettingsService";
import { noAudit, noRestrictions, type AuditLogger, type RestrictionGuard } from "./compliance";
import type { LimitService } from "./LimitService";
import { enforceRateLimit, type RateLimitPolicy } from "@/server/lib/rate-limit";
import { runInTransaction } from "./transaction";
import { WebhookRetryLater, type WebhookHandler, type WebhookHandlerResult } from "./WebhookService";

type PayoutRepos = {
  payouts: PayoutRepository;
  payoutMethods: PayoutMethodRepository;
  wallets: CreatorWalletRepository;
  ledger: LedgerRepository;
  profiles: CreatorProfileRepository;
  users: UserRepository;
  accountDeletions: AccountDeletionRepository;
};

export type PayoutServiceDeps = {
  repos: PayoutRepos;
  monime: MonimeClient;
  balances: Pick<BalanceService, "getBalance">;
  methods: Pick<PayoutMethodService, "current" | "assertHolderUnchanged">;
  kyc: Pick<KycService, "approvedLegalName">;
  settings: Pick<PlatformSettingsService, "get">;
  email: EmailService;
  appBaseUrl: string;
  now?: () => Date;
  transaction?: typeof runInTransaction;
  audit?: AuditLogger;
  restrictions?: RestrictionGuard;
  limits?: Pick<LimitService, "payoutCheck">;
  rateLimit?: (policy: RateLimitPolicy, id: string) => Promise<void>;
};

/**
 * Withdrawals (implementation.md Phase 6). The payout fee is charged on top: the creator's
 * number receives exactly `amount`, the wallet loses `amount + fee`.
 *
 * Safety properties:
 * - one open payout per creator (partial unique index);
 * - the destination comes from the bound payout method only, re-verified with the provider;
 * - balance = min(live, ledger), failing closed;
 * - a Monime call that may have gone through is never answered with "failed": the payout stays
 *   `requested` and is re-sent with the same idempotency key, so it can't be paid twice;
 * - completion is applied once (row lock + `completionApplied`), whoever reports it first.
 */
export class PayoutService {
  private readonly repos: PayoutRepos;
  private readonly deps: PayoutServiceDeps;
  private readonly now: () => Date;
  private readonly transaction: typeof runInTransaction;
  private readonly audit: AuditLogger;

  constructor(deps: PayoutServiceDeps) {
    this.deps = deps;
    this.audit = deps.audit ?? noAudit;
    this.repos = deps.repos;
    this.now = deps.now ?? (() => new Date());
    this.transaction = deps.transaction ?? runInTransaction;
  }

  webhookHandlers(): Record<string, WebhookHandler> {
    return {
      "payout.completed": (e) => this.onPayoutEvent(e),
      "payout.failed": (e) => this.onPayoutEvent(e),
    };
  }

  // ── Creator ───────────────────────────────────────────────────────────────────

  /**
   * `final`: the creator is emptying their account before deleting it. The minimum withdrawal is
   * waived, but only for exactly the largest amount the balance allows, so it can't be used to
   * send small withdrawals in general.
   */
  async request(actor: Actor, input: { amountMinor: number; final?: boolean }): Promise<Payout> {
    const settings = await this.deps.settings.get();
    if (settings.payoutsKillSwitch) throw new ConflictError("Withdrawals are paused right now. Please try again later.");
    if (actor.status !== "active") throw new ConflictError("Withdrawals aren't available on your account. Contact support.");
    if (!actor.emailVerified) throw new ConflictError("Confirm your email before withdrawing.");
    if (!(await this.deps.kyc.approvedLegalName(actor.userId))) throw new ConflictError("Verify your identity before withdrawing.");
    await (this.deps.restrictions ?? noRestrictions).assertAllowed(actor.userId, "withdraw", "Withdrawals aren't available on your account right now. Contact support.");
    await (this.deps.rateLimit ?? enforceRateLimit)("payout:user", actor.userId);

    const wallet = await this.repos.wallets.findByUserId(actor.userId);
    if (wallet?.status !== "active" || !wallet.monimeFinancialAccountId) throw new ConflictError("Your wallet isn't ready for withdrawals.");

    // Checked early for a clear message; the partial unique index is the real guard.
    if (await this.repos.payouts.findOpenForCreator(actor.userId)) throw new ConflictError("You already have a withdrawal in progress.");

    const method = await this.deps.methods.current(actor.userId);
    if (!method) throw new ConflictError("Add a mobile money number first.");
    if (method.status === "cooling_off") {
      throw new ConflictError(`For your safety, withdrawals to a new number open on ${method.cooldownUntil?.toISOString().slice(0, 16).replace("T", " ")} UTC.`);
    }
    if (method.status !== "active") throw new ConflictError("Your payout number needs a check by our team before you can withdraw.");

    if (input.amountMinor <= 0) throw new ValidationError(undefined, { amount: ["Enter an amount to withdraw."] });
    if (input.amountMinor < settings.minPayoutMinor && !input.final) {
      throw new ValidationError(undefined, { amount: [`The minimum withdrawal is ${formatSLE(settings.minPayoutMinor)}.`] });
    }
    // Phase 7: LimitService payout caps (daily/30-day by tier) go here.

    await this.deps.methods.assertHolderUnchanged(method);

    const balance = await this.deps.balances.getBalance(actor.userId);
    if (balance.availableMinor === null) {
      throw new ExternalServiceError("monime", "We couldn't confirm your balance right now. Please try again shortly.");
    }
    if (input.final && input.amountMinor < settings.minPayoutMinor && input.amountMinor !== balance.maxWithdrawableMinor) {
      throw new ValidationError(undefined, {
        amount: [`A final withdrawal sends everything you can withdraw: ${formatSLE(balance.maxWithdrawableMinor)}.`],
      });
    }
    const quotedFee = payoutFee(input.amountMinor, settings.payoutFeeBpsEstimate);
    if (input.amountMinor + quotedFee > balance.availableMinor) {
      throw new ValidationError(undefined, {
        amount: [`You can withdraw up to ${formatSLE(balance.maxWithdrawableMinor)} (the ${formatSLE(quotedFee)} fee is added on top).`],
      });
    }

    const profile = await this.repos.profiles.findByUserId(actor.userId);
    const limit = this.deps.limits
      ? await this.deps.limits.payoutCheck({ creatorId: actor.userId, amountMinor: input.amountMinor, verificationTier: profile?.verificationTier ?? null, riskTier: profile?.riskTier ?? null })
      : { outcome: "allow" as const, breaches: [] };
    if (limit.outcome === "block") throw new ConflictError("This withdrawal is over your current limit. Try a smaller amount or contact support.");
    const riskyTier = profile?.riskTier === "high" || profile?.riskTier === "restricted";
    const needsReview = input.amountMinor > settings.payoutAutoApproveMaxMinor || riskyTier || limit.outcome === "review";

    let payout: Payout;
    try {
      payout = await this.transaction(async (tx) => {
        // The wallet row is the per-creator money lock (also taken by deletion and erasure).
        // Everything read before it may be stale, so re-check what money and state depend on.
        const locked = await this.repos.wallets.lockByUserId(actor.userId, tx);
        if (locked?.status !== "active") throw new ConflictError("Your wallet isn't ready for withdrawals.");
        if (await this.repos.accountDeletions.hasOpenRequest(actor.userId, tx)) {
          throw new ConflictError("Your account is scheduled for deletion. Cancel the deletion to withdraw.");
        }
        // A payout completed since the balance was read has already debited the ledger.
        const ledgerNow = await this.repos.ledger.balance(accounts.creatorWallet(actor.userId), tx);
        if (input.amountMinor + quotedFee > Math.min(balance.availableMinor!, ledgerNow)) {
          throw new ConflictError("Your balance changed while you were withdrawing. Please check it and try again.");
        }
        const id = crypto.randomUUID();
        return this.repos.payouts.insert(
          {
            id,
            creatorId: actor.userId,
            payoutMethodId: method.id,
            amountMinor: input.amountMinor,
            quotedFeeMinor: quotedFee,
            status: needsReview ? "in_review" : "requested",
            reviewReason: !needsReview ? null : riskyTier ? "risk_tier" : limit.outcome === "review" ? "limit" : "above_auto_approve",
            idempotencyKey: `payout-${id}`,
            destinationSnapshot: { type: "momo", providerId: method.providerId, masked: maskMsisdn(method.msisdnLast3) },
            holderNameAtRequest: method.holderName,
          },
          tx,
        );
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError("You already have a withdrawal in progress.");
      throw err;
    }
    await this.audit.log({ actor, action: "payout.request", targetType: "payout", targetId: payout.id, after: { amountMinor: payout.amountMinor, status: payout.status } });
    return needsReview ? payout : this.dispatch(payout.id);
  }

  async listForCreator(actor: Actor) {
    return this.repos.payouts.listForCreator(actor.userId);
  }

  // ── Staff ─────────────────────────────────────────────────────────────────────

  async listInReview(actor: Actor) {
    if (!isStaff(actor.role)) throw new ForbiddenError();
    return this.repos.payouts.listByStatus("in_review");
  }

  /**
   * Staff release of an in-review payout. At or above `payouts.dualApprovalMin` two different
   * staff members must approve; the first approval is recorded and the payout stays in review.
   */
  async release(actor: Actor, payoutId: string): Promise<{ payout: Payout; released: boolean }> {
    if (!isStaff(actor.role)) throw new ForbiddenError();
    const settings = await this.deps.settings.get();
    const outcome = await this.transaction(async (tx) => {
      const payout = await this.repos.payouts.lockById(payoutId, tx);
      if (!payout || payout.status !== "in_review") throw new ConflictError("This withdrawal is no longer waiting for review.");
      const prior = (payout.approvals as { by: string }[]) ?? [];
      if (prior.some((a) => a.by === actor.userId)) throw new ForbiddenError("You've already approved this. A different staff member must give the second approval.");
      const approvals = [...prior, { by: actor.userId, at: this.now().toISOString() }];
      const needed = payout.amountMinor >= settings.payoutDualApprovalMinMinor ? 2 : 1;
      if (approvals.length < needed) {
        return { payout: (await this.repos.payouts.update(payoutId, { approvals }, tx))!, released: false };
      }
      const released = await this.repos.payouts.transition(payoutId, ["in_review"], "requested", { reviewerId: actor.userId, approvals }, tx);
      return { payout: released!, released: true };
    });
    logger.info(outcome.released ? "payout released" : "payout first approval", { payoutId, reviewerId: actor.userId });
    await this.audit.log({
      actor,
      action: outcome.released ? "payout.release" : "payout.approve_first",
      targetType: "payout",
      targetId: payoutId,
      before: { status: "in_review" },
      after: { status: outcome.payout.status, approvals: outcome.payout.approvals },
    });
    if (!outcome.released) return outcome;
    return { payout: await this.dispatch(payoutId), released: true };
  }

  async reject(actor: Actor, payoutId: string, reason: string): Promise<void> {
    if (!isStaff(actor.role)) throw new ForbiddenError();
    const rejected = await this.repos.payouts.transition(payoutId, ["in_review"], "canceled", {
      reviewerId: actor.userId,
      failureMessage: reason.slice(0, 300),
    });
    if (!rejected) throw new ConflictError("This withdrawal is no longer waiting for review.");
    logger.info("payout rejected", { payoutId, reviewerId: actor.userId });
    await this.audit.log({ actor, action: "payout.reject", targetType: "payout", targetId: payoutId, after: { reason } });
  }

  // ── Dispatch & completion ─────────────────────────────────────────────────────

  /**
   * Send a `requested` payout to Monime (also the Phase 9 reconcile entry point for payouts
   * stuck in `requested`). Only a definitive Monime rejection marks it failed.
   */
  async dispatch(payoutId: string): Promise<Payout> {
    const current = await this.repos.payouts.findById(payoutId);
    if (!current) throw new NotFoundError();
    if (current.status !== "requested") return current;
    // Only one dispatcher at a time (request, release, the reconcile cron, a staff redispatch).
    const payout = await this.repos.payouts.claimDispatch(payoutId);
    if (!payout) return (await this.repos.payouts.findById(payoutId)) ?? current;
    const [method, wallet] = await Promise.all([
      this.repos.payoutMethods.findById(payout.payoutMethodId),
      this.repos.wallets.findByUserId(payout.creatorId),
    ]);
    // Re-checked at send time: a payout can wait in review while either changes. A payout already
    // sent once (unknown outcome, `lastError` set) may exist at Monime, so it is never failed here.
    if (method?.status !== "active" || wallet?.status !== "active" || !wallet.monimeFinancialAccountId) {
      if (payout.lastError) {
        logger.error("payout re-send held: method or wallet no longer active", { payoutId, method: method?.status, wallet: wallet?.status });
        return (await this.repos.payouts.update(payout.id, { lastError: payout.lastError })) ?? payout; // ends the claim
      }
      const failed = await this.repos.payouts.transition(payout.id, ["requested"], "failed", {
        failureCode: "destination_unavailable",
        failureMessage: method?.status !== "active" ? "The payout number is no longer active." : "The wallet is not active.",
      });
      logger.warn("payout not sent: method or wallet no longer active", { payoutId, method: method?.status, wallet: wallet?.status });
      return failed ?? payout;
    }

    let result: MonimePayout;
    try {
      result = await this.deps.monime.createPayout(
        {
          destination: { type: "momo", providerId: method.providerId, phoneNumber: decryptField(method.msisdnEnc) },
          amount: { currency: "SLE", value: payout.amountMinor },
          source: { financialAccountId: wallet.monimeFinancialAccountId },
          metadata: { payoutId: payout.id, creatorId: payout.creatorId },
        },
        payout.idempotencyKey,
      );
    } catch (err) {
      if (err instanceof MonimeApiError && !err.retryable) {
        const failed = await this.repos.payouts.transition(payout.id, ["requested"], "failed", {
          failureCode: err.code,
          failureMessage: err.message.slice(0, 300),
        });
        logger.warn("payout rejected by Monime", { payoutId, code: err.code });
        return failed ?? payout;
      }
      // Unknown outcome: it may exist at Monime. Keep `requested`; a retry re-sends the same key.
      logger.error("payout dispatch outcome unknown; will retry with the same key", { payoutId, err });
      return (await this.repos.payouts.update(payout.id, { lastError: err instanceof Error ? err.message.slice(0, 300) : "unknown" })) ?? payout;
    }

    await this.repos.payouts.update(payout.id, { monimePayoutId: result.id, lastError: null });
    const processing = (await this.repos.payouts.transition(payout.id, ["requested"], "processing")) ?? payout;
    if (result.status === "completed" || result.status === "failed") await this.applyResult(payout.id, result);
    return (await this.repos.payouts.findById(payout.id)) ?? processing;
  }

  async onPayoutEvent(event: MonimeEvent): Promise<WebhookHandlerResult> {
    const data = unwrapResult<MonimePayout>(event.data);
    if (data.status !== "completed" && data.status !== "failed") return { status: "ignored" };
    await this.applyResult(null, data);
    return { status: "processed" };
  }

  /** Phase 9 reconcile: read a processing payout's state from Monime. */
  async syncFromMonime(payoutId: string): Promise<void> {
    const payout = await this.repos.payouts.findById(payoutId);
    if (!payout?.monimePayoutId || payout.status !== "processing") return;
    const result = await this.deps.monime.getPayout(payout.monimePayoutId);
    if (result.status === "completed" || result.status === "failed") await this.applyResult(payout.id, result);
  }

  /** Idempotent, order-safe completion. Never moves a completed payout. */
  private async applyResult(knownPayoutId: string | null, data: MonimePayout): Promise<void> {
    const outcome = await this.transaction(async (tx) => {
      const payout =
        (data.id ? await this.repos.payouts.lockByMonimeId(data.id, tx) : null) ??
        (await this.lockByMetadata(knownPayoutId ?? stringOrNull(data.metadata?.payoutId), tx));
      if (!payout) throw new WebhookRetryLater("payout not found yet");

      if (data.status === "completed") {
        if (payout.completionApplied) return null;
        if (payout.status === "failed") logger.error("Monime completed a payout we had marked failed; recording it", { payoutId: payout.id });
        const reported = sumMonimeFees(data.fees);
        const fee = reported ?? payout.quotedFeeMinor;
        await this.repos.payouts.update(
          payout.id,
          {
            status: "completed",
            monimePayoutId: payout.monimePayoutId ?? data.id,
            feeMinor: fee,
            feeSource: reported === null ? "estimated" : "reported",
            totalDebitMinor: payout.amountMinor + fee,
            completionApplied: true,
            completedAt: this.now(),
          },
          tx,
        );
        await this.repos.ledger.postJournal(
          payoutJournal({ id: payout.id, creatorId: payout.creatorId, amountMinor: payout.amountMinor, feeMinor: fee }),
          tx,
        );
        return { payout, outcome: "completed" as const };
      }

      if (payout.status === "completed") {
        logger.error("Monime reported failure for a completed payout; ignoring", { payoutId: payout.id });
        return null;
      }
      const detail = typeof data.failureDetail === "object" && data.failureDetail ? data.failureDetail : null;
      const failed = await this.repos.payouts.transition(
        payout.id,
        ["requested", "processing"],
        "failed",
        { failureCode: detail?.code ?? null, failureMessage: describeMonimeFailure(data, "Payout failed") },
        tx,
      );
      return failed ? { payout, outcome: "failed" as const } : null;
    });

    if (outcome) await this.notify(outcome.payout, outcome.outcome);
  }

  private async lockByMetadata(payoutId: string | null, tx: Parameters<PayoutRepository["lockById"]>[1]) {
    if (!payoutId || !/^[0-9a-f-]{36}$/i.test(payoutId)) return null;
    return this.repos.payouts.lockById(payoutId, tx);
  }

  private async notify(payout: Payout, outcome: "completed" | "failed") {
    const user = await this.repos.users.findById(payout.creatorId);
    if (!user) return;
    const fresh = (await this.repos.payouts.findById(payout.id)) ?? payout;
    const snapshot = payout.destinationSnapshot as { masked?: string };
    await this.deps.email
      .send({
        to: user.email,
        ...payoutResultTemplate({
          outcome,
          amount: formatSLE(payout.amountMinor),
          maskedNumber: snapshot.masked ?? "your number",
          reason: fresh.failureMessage ?? undefined,
          url: `${this.deps.appBaseUrl.replace(/\/$/, "")}/dashboard/wallet`,
        }),
      })
      .catch((err) => logger.error("payout email failed", { payoutId: payout.id, err }));
  }
}

const stringOrNull = (v: unknown) => (typeof v === "string" && v ? v : null);
