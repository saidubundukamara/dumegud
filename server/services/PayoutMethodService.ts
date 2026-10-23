import "server-only";
import { detectOperator, maskMsisdn, normalizeSlPhone, OPERATOR_LABELS, type Operator } from "@/lib/phone";
import type { PayoutMethod } from "@/server/db/schema";
import type { EmailService } from "@/server/integrations/email";
import { payoutMethodChangedTemplate } from "@/server/integrations/email/templates";
import { MonimeApiError, type MonimeClient } from "@/server/integrations/monime";
import { decryptField, encryptField } from "@/server/lib/crypto";
import { ConflictError, ExternalServiceError, ValidationError } from "@/server/lib/errors";
import { pepperedHash } from "@/server/lib/hash";
import { logger } from "@/server/lib/logger";
import { matchNames } from "@/server/lib/name-match";
import { enforceRateLimit, type RateLimitPolicy } from "@/server/lib/rate-limit";
import type { PayoutMethodRepository } from "@/server/repositories/PayoutMethodRepository";
import type { UserRepository } from "@/server/repositories/UserRepository";
import type { Actor } from "./actor";
import type { KycService } from "./KycService";
import type { PlatformSettingsService } from "./PlatformSettingsService";
import { noAudit, type AuditLogger } from "./compliance";
import type { RiskService } from "./RiskService";
import { runInTransaction } from "./transaction";

export type PayoutMethodDTO = {
  provider: Operator;
  providerLabel: string;
  masked: string;
  holderName: string | null;
  status: PayoutMethod["status"];
  cooldownUntil: Date | null;
};

export type PayoutMethodServiceDeps = {
  repos: { payoutMethods: PayoutMethodRepository; users: UserRepository };
  kyc: Pick<KycService, "approvedLegalName">;
  monime: MonimeClient;
  settings: Pick<PlatformSettingsService, "get">;
  email: EmailService;
  appBaseUrl: string;
  now?: () => Date;
  rateLimit?: (policy: RateLimitPolicy, id: string) => Promise<void>;
  transaction?: typeof runInTransaction;
  audit?: AuditLogger;
  risk?: Pick<RiskService, "evaluatePayoutMethodChange">;
};

/**
 * Binding the mobile-money number withdrawals go to (implementation.md Phase 6). The
 * destination is never taken from a withdrawal request: only from here, after a provider-KYC
 * holder-name check against the verified legal name, followed by a cooldown (longer on a
 * change, with an email) to blunt SIM-swap and account-takeover payouts.
 */
export class PayoutMethodService {
  private readonly deps: PayoutMethodServiceDeps;
  private readonly now: () => Date;
  private readonly rateLimit: (policy: RateLimitPolicy, id: string) => Promise<void>;
  private readonly transaction: typeof runInTransaction;

  constructor(deps: PayoutMethodServiceDeps) {
    this.deps = deps;
    this.now = deps.now ?? (() => new Date());
    this.rateLimit = deps.rateLimit ?? enforceRateLimit;
    this.transaction = deps.transaction ?? runInTransaction;
  }

  /** The current method, promoting it to active once its cooldown has passed. */
  async current(userId: string): Promise<PayoutMethod | null> {
    const method = await this.deps.repos.payoutMethods.current(userId);
    if (method?.status === "cooling_off" && method.cooldownUntil && method.cooldownUntil < this.now()) {
      return (await this.deps.repos.payoutMethods.promoteIfCooled(method.id, this.now())) ?? method;
    }
    return method;
  }

  async get(actor: Actor): Promise<PayoutMethodDTO | null> {
    const m = await this.current(actor.userId);
    if (!m) return null;
    return {
      provider: m.providerId,
      providerLabel: OPERATOR_LABELS[m.providerId],
      masked: maskMsisdn(m.msisdnLast3),
      holderName: m.holderName,
      status: m.status,
      cooldownUntil: m.status === "cooling_off" ? m.cooldownUntil : null,
    };
  }

  async bind(actor: Actor, input: { phone: string; providerId: Operator | null }): Promise<PayoutMethodDTO> {
    const legalName = await this.deps.kyc.approvedLegalName(actor.userId);
    if (!legalName) throw new ConflictError("Verify your identity before adding a payout number.");
    await this.rateLimit("provider-kyc:user", actor.userId); // each check costs a Monime call

    const msisdn = normalizeSlPhone(input.phone);
    if (!msisdn) throw new ValidationError(undefined, { phone: ["Enter a Sierra Leone mobile number, like 076 123 456."] });
    const settings = await this.deps.settings.get();
    const providerId = input.providerId ?? detectOperator(msisdn, settings.operatorPrefixes);
    if (!providerId) throw new ValidationError(undefined, { providerId: ["Choose Orange Money or AfriMoney."] });

    const holderName = await this.lookupHolder(providerId, msisdn);
    if (holderName === null) {
      throw new ValidationError(undefined, { phone: [`This number isn't registered for ${OPERATOR_LABELS[providerId]}.`] });
    }
    const match = matchNames(holderName, legalName);
    const flagged = match === "mismatch" && settings.nameMatchEnforced;
    if (match === "mismatch") logger.warn("payout number holder doesn't match legal name", { userId: actor.userId, enforced: flagged });

    const existing = await this.current(actor.userId);
    const hours = existing ? settings.changedMethodCooldownHours : settings.firstMethodCooldownHours;
    const now = this.now();
    const method = await this.transaction(async (tx) => {
      await this.deps.repos.payoutMethods.disableCurrent(actor.userId, tx);
      return this.deps.repos.payoutMethods.insert(
        {
          userId: actor.userId,
          providerId,
          msisdnEnc: encryptField(msisdn),
          msisdnHash: pepperedHash("msisdn", msisdn),
          msisdnLast3: msisdn.slice(-3),
          holderName,
          nameMatch: match,
          status: flagged ? "needs_recheck" : hours > 0 ? "cooling_off" : "active",
          cooldownUntil: hours > 0 ? new Date(now.getTime() + hours * 3_600_000) : null,
          boundAt: now,
          verifiedAt: flagged ? null : now,
        },
        tx,
      );
    });
    logger.info("payout method bound", { userId: actor.userId, replaced: Boolean(existing), status: method.status });
    await (this.deps.audit ?? noAudit).log({
      actor,
      action: existing ? "payout_method.change" : "payout_method.bind",
      targetType: "payout_method",
      targetId: method.id,
      before: existing ? { id: existing.id, last3: existing.msisdnLast3, providerId: existing.providerId } : null,
      after: { last3: method.msisdnLast3, providerId: method.providerId, nameMatch: method.nameMatch, status: method.status },
    });
    await this.deps.risk?.evaluatePayoutMethodChange(actor.userId);

    if (existing) {
      const user = await this.deps.repos.users.findById(actor.userId);
      if (user) {
        await this.deps.email
          .send({
            to: user.email,
            ...payoutMethodChangedTemplate({
              maskedNumber: maskMsisdn(method.msisdnLast3),
              cooldownHours: hours,
              url: `${this.deps.appBaseUrl.replace(/\/$/, "")}/dashboard/payout-method`,
              resetUrl: `${this.deps.appBaseUrl.replace(/\/$/, "")}/forgot-password`,
            }),
          })
          .catch((err) => logger.error("payout method change email failed", { err }));
      }
    }
    return (await this.get(actor))!;
  }

  /**
   * Withdrawal-time re-check (SIM swap / recycled number): the registered holder must still be
   * the one we bound. On any change the method needs staff re-check. Throws ConflictError then.
   */
  async assertHolderUnchanged(method: PayoutMethod): Promise<void> {
    const msisdn = decryptField(method.msisdnEnc);
    const holder = await this.lookupHolder(method.providerId, msisdn);
    const normalise = (n: string | null) => (n ?? "").toLowerCase().replace(/[^a-z]/g, "");
    if (holder === null || normalise(holder) !== normalise(method.holderName)) {
      await this.deps.repos.payoutMethods.setStatus(method.id, "needs_recheck");
      logger.error("payout number holder changed since binding; method flagged", { methodId: method.id });
      throw new ConflictError("Your payout number's registered name changed. For your safety, our team needs to check it before you can withdraw.");
    }
  }

  /** Holder name, or null when the number isn't registered. Provider errors fail closed. */
  private async lookupHolder(providerId: Operator, msisdn: string): Promise<string | null> {
    try {
      return (await this.deps.monime.getProviderKyc(providerId, msisdn)).account.holderName ?? null;
    } catch (err) {
      if (err instanceof MonimeApiError && err.status === 404) return null;
      throw new ExternalServiceError("monime", "We couldn't check this number right now. Please try again shortly.", { cause: err });
    }
  }
}
