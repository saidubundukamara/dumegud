import "server-only";
import type { LimitAction, LimitScope, LimitWindow, Payment, TransactionLimit } from "@/server/db/schema";
import { logger } from "@/server/lib/logger";
import type { RiskRepository } from "@/server/repositories/RiskRepository";
import type { Tx } from "./transaction";

const WINDOW_MS: Record<Exclude<LimitWindow, "single">, number> = {
  "24h": 86_400_000,
  "7d": 7 * 86_400_000,
  "30d": 30 * 86_400_000,
};

export type LimitBreach = { limitId: string; scope: LimitScope; window: LimitWindow; action: LimitAction; detail: string };

export type LimitOutcome = {
  /** The strictest action among breaches: block > review > flag > allow. */
  outcome: "allow" | LimitAction;
  breaches: LimitBreach[];
};

type Tiers = { verificationTier: string | null; riskTier: string | null };

const RANK: Record<LimitOutcome["outcome"], number> = { allow: 0, flag: 1, review: 2, block: 3 };

/**
 * Configurable limits (PRD §6.2, implementation.md Phase 7). Every number comes from
 * `transaction_limits`, edited in admin and effective immediately. Totals are computed live with
 * indexed SUM/COUNT over payments/payouts (no counter table to drift).
 *
 * - `precheck` before checkout (payer unknown): per-contribution, creator receipts, IP velocity.
 * - `postcheck` after settlement, once the payer fingerprint is known: supporter→creator and
 *   supporter-global totals, payer velocity. A breach holds the payment for review before any
 *   money moves to the creator.
 * - `payoutCheck` on withdrawal: creator payout totals.
 */
export class LimitService {
  constructor(
    private readonly repo: RiskRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async precheck(input: { creatorId: string; amountMinor: number; ipHash: string | null } & Tiers): Promise<LimitOutcome> {
    const limits = await this.applicable(["per_contribution", "creator_receipts", "velocity_count"], input);
    const breaches: LimitBreach[] = [];
    for (const limit of limits) {
      if (limit.scope === "per_contribution" && limit.maxAmountMinor !== null && input.amountMinor > limit.maxAmountMinor) {
        breaches.push(this.breach(limit, `amount ${input.amountMinor} > ${limit.maxAmountMinor}`));
      }
      if (limit.scope === "creator_receipts" && limit.maxAmountMinor !== null && limit.window !== "single") {
        const total = await this.repo.creatorReceipts(input.creatorId, this.since(limit.window));
        if (total + input.amountMinor > limit.maxAmountMinor) breaches.push(this.breach(limit, `receipts ${total} + ${input.amountMinor} > ${limit.maxAmountMinor}`));
      }
      if (limit.scope === "velocity_count" && limit.maxCount !== null && limit.window !== "single" && input.ipHash) {
        const count = await this.repo.checkoutsFromIp(input.ipHash, this.since(limit.window));
        if (count + 1 > limit.maxCount) breaches.push(this.breach(limit, `checkouts from network ${count + 1} > ${limit.maxCount}`));
      }
    }
    return this.result(breaches);
  }

  async postcheck(payment: Payment, tiers: Tiers, tx?: Tx): Promise<LimitOutcome> {
    if (!payment.payerFingerprintHash) return { outcome: "allow", breaches: [] };
    const limits = await this.applicable(["supporter_to_creator", "supporter_global"], tiers, tx);
    const breaches: LimitBreach[] = [];
    for (const limit of limits) {
      if (limit.window === "single") continue;
      const totals = await this.repo.payerTotals(
        payment.payerFingerprintHash,
        this.since(limit.window),
        limit.scope === "supporter_to_creator" ? payment.creatorId : undefined,
        tx,
      );
      if (limit.maxAmountMinor !== null && totals.sumMinor > limit.maxAmountMinor) {
        breaches.push(this.breach(limit, `payer total ${totals.sumMinor} > ${limit.maxAmountMinor}`));
      }
      if (limit.maxCount !== null && totals.count > limit.maxCount) {
        breaches.push(this.breach(limit, `payer count ${totals.count} > ${limit.maxCount}`));
      }
    }
    return this.result(breaches);
  }

  async payoutCheck(input: { creatorId: string; amountMinor: number } & Tiers): Promise<LimitOutcome> {
    const limits = await this.applicable(["creator_payouts"], input);
    const breaches: LimitBreach[] = [];
    for (const limit of limits) {
      if (limit.maxAmountMinor === null) continue;
      const total = limit.window === "single" ? 0 : await this.repo.payoutTotal(input.creatorId, this.since(limit.window));
      if (total + input.amountMinor > limit.maxAmountMinor) breaches.push(this.breach(limit, `payouts ${total} + ${input.amountMinor} > ${limit.maxAmountMinor}`));
    }
    return this.result(breaches);
  }

  /** Limits for these scopes that apply to the creator's tiers (null tier = everyone). */
  private async applicable(scopes: LimitScope[], tiers: Tiers, tx?: Tx): Promise<TransactionLimit[]> {
    const limits = await this.repo.activeLimits(scopes, tx);
    return limits.filter(
      (l) => (l.verificationTier === null || l.verificationTier === tiers.verificationTier) && (l.riskTier === null || l.riskTier === tiers.riskTier),
    );
  }

  private since(window: Exclude<LimitWindow, "single">): Date {
    return new Date(this.now().getTime() - WINDOW_MS[window]);
  }

  private breach(limit: TransactionLimit, detail: string): LimitBreach {
    return { limitId: limit.id, scope: limit.scope, window: limit.window, action: limit.action, detail };
  }

  private result(breaches: LimitBreach[]): LimitOutcome {
    const outcome = breaches.reduce<LimitOutcome["outcome"]>((worst, b) => (RANK[b.action] > RANK[worst] ? b.action : worst), "allow");
    if (breaches.length) logger.info("limit breached", { outcome, scopes: breaches.map((b) => `${b.scope}/${b.window}`) });
    return { outcome, breaches };
  }
}
