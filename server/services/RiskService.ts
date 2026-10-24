import "server-only";
import type { AlertSeverity, Payment } from "@/server/db/schema";
import { logger } from "@/server/lib/logger";
import type { CreatorProfileRepository } from "@/server/repositories/CreatorProfileRepository";
import type { PaymentRepository } from "@/server/repositories/PaymentRepository";
import type { RiskRepository } from "@/server/repositories/RiskRepository";
import type { UserRepository } from "@/server/repositories/UserRepository";
import type { LimitBreach } from "./LimitService";
import { runInTransaction, type Tx } from "./transaction";

type Params = Record<string, number>;
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export type AlertInput = {
  ruleCode: string;
  subjectType: "creator" | "payment" | "payout" | "product" | "platform";
  subjectId: string;
  creatorId: string | null;
  severity: AlertSeverity;
  evidence: Record<string, unknown>;
};

/**
 * Rules-based monitoring (PRD §6.3/§6.4). Rules produce *signals* (alerts) for humans to review;
 * they never restrict anyone. High-severity signals can raise a creator's risk tier (which
 * routes their large payouts to review), never lower it. Parameters live in `risk_rules`.
 * Evaluation is best-effort: a failure is logged and never blocks the money flow.
 */
export class RiskService {
  constructor(
    private readonly repos: { risk: RiskRepository; payments: PaymentRepository; profiles: CreatorProfileRepository; users: UserRepository },
    private readonly now: () => Date = () => new Date(),
    private readonly transaction: typeof runInTransaction = runInTransaction,
  ) {}

  /** After a payment settles. */
  async evaluatePayment(paymentId: string): Promise<void> {
    try {
      const payment = await this.repos.payments.findById(paymentId);
      if (!payment) return;
      const rules = new Map((await this.repos.risk.activeRules()).map((r) => [r.code, r]));
      const run = async (code: string, check: (p: Params) => Promise<Record<string, unknown> | null>) => {
        const rule = rules.get(code);
        if (!rule) return;
        const evidence = await check(rule.params as Params);
        if (evidence) await this.raise({ ruleCode: code, subjectType: "creator", subjectId: payment.creatorId, creatorId: payment.creatorId, severity: rule.severity, evidence: { paymentId, ...evidence } });
      };
      await run("RAPID_REPEAT", (p) => this.rapidRepeat(payment, p));
      await run("JUST_BELOW_THRESHOLD", (p) => this.justBelow(payment, p));
      await run("SAME_PAYER_CONCENTRATION", (p) => this.concentration(payment, p));
      await run("NEW_CREATOR_SPIKE", (p) => this.newCreatorSpike(payment, p));
      await run("FAILURE_SPIKE", (p) => this.failureSpike(payment, p));
      await run("SELF_FUNDING", (p) => this.selfFunding(payment, p));
    } catch (err) {
      logger.error("risk evaluation failed", { paymentId, err });
    }
  }

  /** After a payout number is bound or changed. */
  async evaluatePayoutMethodChange(userId: string): Promise<void> {
    try {
      const rule = (await this.repos.risk.activeRules()).find((r) => r.code === "PAYOUT_DETAIL_CHURN");
      if (!rule) return;
      const p = rule.params as Params;
      const bound = await this.repos.risk.payoutMethodCount(userId, new Date(this.now().getTime() - p.days * DAY));
      if (bound - 1 >= p.changes) {
        await this.raise({ ruleCode: rule.code, subjectType: "creator", subjectId: userId, creatorId: userId, severity: rule.severity, evidence: { changes: bound - 1, days: p.days } });
      }
    } catch (err) {
      logger.error("risk evaluation failed", { userId, err });
    }
  }

  /** Limit breaches with action `flag` (or any breach worth a record) become alerts. */
  async raiseLimitBreaches(subject: { type: AlertInput["subjectType"]; id: string; creatorId: string }, breaches: LimitBreach[]): Promise<void> {
    for (const b of breaches) {
      await this.raise({
        ruleCode: `LIMIT_${b.scope.toUpperCase()}`,
        subjectType: subject.type,
        subjectId: subject.id,
        creatorId: subject.creatorId,
        severity: b.action === "flag" ? "low" : "medium",
        evidence: { limitId: b.limitId, window: b.window, action: b.action, detail: b.detail },
      }).catch((err) => logger.error("failed to raise limit alert", { err }));
    }
  }

  /** Create an alert unless the same rule already has an open one for this subject today. */
  async raise(input: AlertInput): Promise<void> {
    const since = new Date(this.now().getTime() - DAY);
    const raised = await this.transaction(async (tx) => {
      // The creator's profile row serialises concurrent signals for them: two settlements at once
      // would otherwise both miss the other's alert, insert duplicates and over-count for the tier.
      if (input.creatorId) await this.repos.profiles.lockByUserId(input.creatorId, tx);
      if (await this.repos.risk.recentOpenAlert(input.ruleCode, input.subjectId, since, tx)) return false;
      await this.repos.risk.insertAlert(input, tx);
      if (input.severity === "high" && input.creatorId) await this.raiseTier(input.creatorId, tx);
      return true;
    });
    if (raised) logger.warn("risk alert raised", { ruleCode: input.ruleCode, severity: input.severity });
  }

  /** low → medium on a high-severity signal; medium → high on repeated ones. Never lowers. */
  private async raiseTier(creatorId: string, tx: Tx) {
    const profile = await this.repos.profiles.findByUserId(creatorId, tx);
    if (!profile) return;
    const highs = await this.repos.risk.countOpenHighAlerts(creatorId, new Date(this.now().getTime() - 7 * DAY), tx);
    const next = profile.riskTier === "low" ? "medium" : profile.riskTier === "medium" && highs >= 2 ? "high" : null;
    if (next) await this.repos.profiles.raiseRiskTier(creatorId, profile.riskTier, next, tx);
  }

  // ── Rules ─────────────────────────────────────────────────────────────────────

  private async rapidRepeat(payment: Payment, p: Params) {
    if (!payment.payerFingerprintHash) return null;
    const { count } = await this.repos.risk.payerTotals(payment.payerFingerprintHash, this.ago(p.minutes * MIN), payment.creatorId);
    return count >= p.count ? { count, minutes: p.minutes } : null;
  }

  private async justBelow(payment: Payment, p: Params) {
    const limits = await this.repos.risk.activeLimits(["per_contribution"]);
    const max = limits.map((l) => l.maxAmountMinor).filter((v): v is number => v !== null).sort((a, b) => a - b)[0];
    if (!max) return null;
    const low = Math.floor(max * (1 - p.withinPercent / 100));
    if (payment.grossMinor < low || payment.grossMinor > max) return null;
    const count = await this.repos.risk.nearThresholdCount(payment.creatorId, this.ago(p.hours * HOUR), low, max);
    return count >= p.count ? { count, low, max } : null;
  }

  private async concentration(payment: Payment, p: Params) {
    if (!payment.payerFingerprintHash) return null;
    const since = this.ago(p.days * DAY);
    const total = await this.repos.risk.creatorSettledTotal(payment.creatorId, since);
    if (total < p.minTotalMinor) return null;
    const { sumMinor } = await this.repos.risk.payerTotals(payment.payerFingerprintHash, since, payment.creatorId);
    const share = Math.floor((sumMinor * 100) / total);
    return share >= p.sharePercent ? { sharePercent: share, totalMinor: total } : null;
  }

  private async newCreatorSpike(payment: Payment, p: Params) {
    const user = await this.repos.users.findById(payment.creatorId);
    if (!user || this.now().getTime() - user.createdAt.getTime() > p.accountAgeDays * DAY) return null;
    const total = await this.repos.risk.creatorSettledTotal(payment.creatorId, this.ago(DAY));
    return total >= p.receipts24hMinor ? { receipts24hMinor: total } : null;
  }

  private async failureSpike(payment: Payment, p: Params) {
    const count = await this.repos.risk.unpaidCount(payment.creatorId, this.ago(p.minutes * MIN));
    return count >= p.count ? { count, minutes: p.minutes } : null;
  }

  private async selfFunding(payment: Payment, p: Params) {
    if (!payment.ipHash) return null;
    return (await this.repos.risk.creatorUsedIp(payment.creatorId, payment.ipHash, this.ago(p.days * DAY))) ? { sameNetworkAsCreator: true } : null;
  }

  private ago(ms: number) {
    return new Date(this.now().getTime() - ms);
  }
}
