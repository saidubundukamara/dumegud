import "server-only";
import { randomUUID } from "node:crypto";
import { formatSLE } from "@/lib/money";
import { isShoutoutPlatform, type ShoutoutPlatform } from "@/lib/shoutout";
import { handleFormatError, normalizeHandle } from "@/lib/handle";
import type { MonimeClient } from "@/server/integrations/monime";
import { creatorTag } from "@/server/lib/cache-tags";
import { randomToken, sha256 } from "@/server/lib/crypto";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/lib/errors";
import { pepperedHash } from "@/server/lib/hash";
import { enforceRateLimit, type RateLimitPolicy } from "@/server/lib/rate-limit";
import type { CreatorProfileRepository } from "@/server/repositories/CreatorProfileRepository";
import type { CreatorWalletRepository } from "@/server/repositories/CreatorWalletRepository";
import type { PaymentRepository } from "@/server/repositories/PaymentRepository";
import type { ShoutoutRepository } from "@/server/repositories/ShoutoutRepository";
import type { UserRepository } from "@/server/repositories/UserRepository";
import type { AddShoutoutInput, StartSupportInput } from "@/server/validation/support";
import type { Actor, RequestContext } from "./actor";
import { noRestrictions, type RestrictionGuard } from "./compliance";
import type { LimitService } from "./LimitService";
import type { RiskService } from "./RiskService";
import { openCheckout } from "./checkout";
import type { PlatformSettingsService } from "./PlatformSettingsService";
import { runInTransaction } from "./transaction";

/** Same supporter, creator and amount within this window → reuse the open checkout (double taps, retries). */
const CHECKOUT_DEDUPE_MS = 60_000;
/** How long after paying the Thank-you page may still add a shout-out handle (= claim cookie life). */
export const SHOUTOUT_CLAIM_MS = 24 * 60 * 60 * 1000;

type ContributionRepos = {
  payments: PaymentRepository;
  profiles: CreatorProfileRepository;
  wallets: CreatorWalletRepository;
  users: UserRepository;
  shoutouts: ShoutoutRepository;
};

export type ContributionServiceDeps = {
  repos: ContributionRepos;
  monime: MonimeClient;
  settings: Pick<PlatformSettingsService, "get">;
  platformAccountId: () => string;
  appBaseUrl: string;
  now?: () => Date;
  rateLimit?: (policy: RateLimitPolicy, id: string) => Promise<void>;
  transaction?: typeof runInTransaction;
  restrictions?: RestrictionGuard;
  limits?: Pick<LimitService, "precheck">;
  risk?: Pick<RiskService, "raiseLimitBreaches">;
};

export type SupporterDTO = {
  paymentId: string;
  name: string | null;
  isAnonymous: boolean;
  message: string | null;
  grossMinor: number;
  monimeFeeMinor: number | null;
  feeEstimated: boolean;
  platformFeeMinor: number | null;
  creatorNetMinor: number | null;
  status: "succeeded" | "processing";
  at: Date;
  /** Shown only when the supporter agreed to shout-outs. */
  shoutout: { platform: ShoutoutPlatform; handle: string } | null;
  shoutoutConsent: boolean;
  thanked: boolean;
};

/** Public "recent supporters" entry. */
export type PublicSupporterDTO = { name: string | null; platform: ShoutoutPlatform | null; handle: string | null };

export class ContributionService {
  private readonly repos: ContributionRepos;
  private readonly monime: MonimeClient;
  private readonly settings: ContributionServiceDeps["settings"];
  private readonly platformAccountId: () => string;
  private readonly appBaseUrl: string;
  private readonly now: () => Date;
  private readonly rateLimit: (policy: RateLimitPolicy, id: string) => Promise<void>;
  private readonly transaction: typeof runInTransaction;
  private readonly deps: ContributionServiceDeps;

  constructor(deps: ContributionServiceDeps) {
    this.deps = deps;
    this.repos = deps.repos;
    this.monime = deps.monime;
    this.settings = deps.settings;
    this.platformAccountId = deps.platformAccountId;
    this.appBaseUrl = deps.appBaseUrl.replace(/\/$/, "");
    this.now = deps.now ?? (() => new Date());
    this.rateLimit = deps.rateLimit ?? enforceRateLimit;
    this.transaction = deps.transaction ?? runInTransaction;
  }

  /**
   * Start a guest contribution: validate, record the payment (`created`), then create the Monime
   * checkout *outside* the transaction and move to `pending`. Returns where to send the supporter.
   * Nothing here marks anything paid: only verified webhooks (or a Monime poll) do that.
   */
  async start(
    input: StartSupportInput,
    ctx: RequestContext,
  ): Promise<{ paymentId: string; redirectUrl: string; claim: string | null }> {
    const settings = await this.settings.get();
    if (input.amount < settings.minContributionMinor || input.amount > settings.maxContributionMinor) {
      throw new ValidationError(undefined, {
        amount: [`Choose an amount between ${formatSLE(settings.minContributionMinor)} and ${formatSLE(settings.maxContributionMinor)}.`],
      });
    }

    const handleLower = normalizeHandle(input.handle);
    if (handleFormatError(handleLower)) throw new NotFoundError("We couldn't find this creator.");
    const profile = await this.repos.profiles.findByHandleLower(handleLower);
    if (!profile || profile.status !== "published") throw new NotFoundError("We couldn't find this creator.");
    const [owner, wallet] = await Promise.all([
      this.repos.users.findAuthState(profile.userId),
      this.repos.wallets.findByUserId(profile.userId),
    ]);
    if (owner?.status !== "active" || wallet?.status !== "active") {
      throw new ConflictError("This creator can't receive support right now.");
    }

    await (this.deps.restrictions ?? noRestrictions).assertAllowed(profile.userId, "receive", "This creator can't receive support right now.");
    await this.rateLimit("checkout:ip", ctx.ip);
    await this.rateLimit("checkout:creator", profile.userId);

    const ipHash = ctx.ip !== "unknown" ? pepperedHash("ip", ctx.ip) : null;
    const limit = this.deps.limits
      ? await this.deps.limits.precheck({ creatorId: profile.userId, amountMinor: input.amount, ipHash, verificationTier: profile.verificationTier, riskTier: profile.riskTier })
      : { outcome: "allow" as const, breaches: [] };
    if (limit.outcome === "block") {
      await this.deps.risk?.raiseLimitBreaches({ type: "creator", id: profile.userId, creatorId: profile.userId }, limit.breaches);
      throw new ConflictError("This creator can't receive this amount right now.");
    }
    if (ipHash) {
      const since = new Date(this.now().getTime() - CHECKOUT_DEDUPE_MS);
      const open = await this.repos.payments.findRecentOpenCheckout(ipHash, profile.userId, input.amount, since);
      // The first attempt's claim cookie is still in this browser.
      if (open?.checkoutUrl) return { paymentId: open.id, redirectUrl: open.checkoutUrl, claim: null };
    }

    // Shout-outs: never for anonymous support, and a handle is kept only with consent.
    const consent = !input.isAnonymous && Boolean(input.shoutoutConsent) && Boolean(input.socialHandle || input.supporterName);
    const handle = consent && input.socialHandle && input.socialPlatform ? { socialPlatform: input.socialPlatform, socialHandle: input.socialHandle } : null;
    const claimSecret = randomToken();

    const payment = await this.transaction((tx) =>
      this.repos.payments.insertContribution(
        {
          kind: "contribution",
          creatorId: profile.userId,
          grossMinor: input.amount,
          platformFeeBps: settings.contributionFeeBps,
          idempotencyKey: randomUUID(),
          ipHash,
          reviewHold: limit.outcome === "review" ? limit.breaches.map((b) => `${b.scope}/${b.window}`).join(",") : null,
          trafficSource: input.source ?? null,
        },
        {
          supporterName: input.isAnonymous ? null : input.supporterName,
          message: profile.supportMessageEnabled ? input.message : null,
          isAnonymous: input.isAnonymous,
          ...(handle ?? {}),
          shoutoutConsent: consent,
          shoutoutConsentAt: consent ? this.now() : null,
          claimHash: sha256(claimSecret),
          // Shown to the creator only until moderation exists (Phase 7).
          messageVisibility: "creator_only",
        },
        tx,
      ),
    );

    if (limit.breaches.length) {
      await this.deps.risk?.raiseLimitBreaches({ type: "payment", id: payment.id, creatorId: profile.userId }, limit.breaches);
    }
    const back = `${this.appBaseUrl}/${profile.handle}/support`;
    const redirectUrl = await openCheckout(
      { monime: this.monime, payments: this.repos.payments, platformAccountId: this.platformAccountId },
      payment,
      {
        name: `Support ${profile.displayName}`,
        lineItemName: "Support",
        description: `Support for @${profile.handle}`,
        successUrl: `${back}/success?p=${payment.id}`,
        cancelUrl: `${back}/cancel?p=${payment.id}`,
        metadata: { kind: "contribution", creatorId: profile.userId },
      },
    );
    return { paymentId: payment.id, redirectUrl, claim: `${payment.id}.${claimSecret}` };
  }

  /** Thank-you page: may this browser (claim cookie) still add a shout-out handle? */
  async canAddShoutout(paymentId: string, claimCookie: string | undefined): Promise<boolean> {
    return (await this.claimable(paymentId, claimCookie)) !== null;
  }

  /**
   * Thank-you page: the paying browser adds a shout-out handle (which also records consent).
   * Once only, within a day of paying, never for anonymous support. Returns the cache tags to refresh.
   */
  async addShoutout(input: AddShoutoutInput, claimCookie: string | undefined, ctx: RequestContext): Promise<{ tags: string[] }> {
    await this.rateLimit("shoutout:ip", ctx.ip);
    const claimed = await this.claimable(input.paymentId, claimCookie);
    if (!claimed) throw new ForbiddenError("This shout-out link has expired.");
    if (!input.socialPlatform || !input.socialHandle) throw new ValidationError(undefined, { socialHandle: ["Enter your username."] });
    const row = await this.repos.shoutouts.setHandleOnce(input.paymentId, {
      socialPlatform: input.socialPlatform,
      socialHandle: input.socialHandle,
      at: this.now(),
    });
    if (!row) throw new ConflictError("You've already added your username.");
    const profile = await this.repos.profiles.findByUserId(claimed.creatorId);
    return { tags: profile ? [creatorTag(profile.id)] : [] };
  }

  private async claimable(paymentId: string, claimCookie: string | undefined) {
    if (!claimCookie) return null;
    const [cookiePaymentId, secret] = claimCookie.split(".");
    if (cookiePaymentId !== paymentId || !secret) return null;
    const contribution = await this.repos.shoutouts.findContributionByPaymentId(paymentId);
    if (!contribution?.claimHash || contribution.claimHash !== sha256(secret)) return null;
    if (contribution.isAnonymous || contribution.socialHandle) return null;
    const payment = await this.repos.payments.findById(paymentId);
    if (payment?.status !== "succeeded") return null;
    const paidAt = payment.settledAt ?? payment.createdAt;
    if (this.now().getTime() - paidAt.getTime() > SHOUTOUT_CLAIM_MS) return null;
    return { creatorId: payment.creatorId };
  }

  /** Dashboard "Supporters": the creator's own contributions only. */
  async listForCreator(actor: Actor): Promise<{ succeeded: SupporterDTO[]; processing: SupporterDTO[] }> {
    const [done, open] = await Promise.all([
      this.repos.payments.listContributions(actor.userId, ["succeeded"], 50),
      this.repos.payments.listContributions(actor.userId, ["pending", "under_review"], 20),
    ]);
    const toDTO = (status: SupporterDTO["status"]) =>
      ({ payment, contribution }: Awaited<ReturnType<PaymentRepository["listContributions"]>>[number]): SupporterDTO => ({
        paymentId: payment.id,
        name: contribution.isAnonymous ? null : contribution.supporterName,
        isAnonymous: contribution.isAnonymous,
        message: contribution.messageVisibility === "hidden_by_moderation" ? null : contribution.message,
        grossMinor: payment.grossMinor,
        monimeFeeMinor: payment.monimeFeeMinor,
        feeEstimated: payment.monimeFeeSource === "estimated",
        platformFeeMinor: payment.platformFeeMinor,
        creatorNetMinor: payment.creatorNetMinor,
        status,
        at: payment.settledAt ?? payment.createdAt,
        shoutout:
          contribution.shoutoutConsent && contribution.socialHandle && isShoutoutPlatform(contribution.socialPlatform)
            ? { platform: contribution.socialPlatform, handle: contribution.socialHandle }
            : null,
        shoutoutConsent: contribution.shoutoutConsent,
        thanked: contribution.thankedAt !== null,
      });
    return { succeeded: done.map(toDTO("succeeded")), processing: open.map(toDTO("processing")) };
  }

  /** Public "recent supporters" for a profile (see recentSupporters). */
  async recentSupportersForProfile(profileId: string): Promise<PublicSupporterDTO[]> {
    const profile = await this.repos.profiles.findById(profileId);
    return profile ? this.recentSupporters(profile.userId) : [];
  }

  /**
   * Public "recent supporters": succeeded and non-anonymous only (no messages until moderation).
   * Handles appear only for supporters who agreed to shout-outs.
   */
  async recentSupporters(creatorUserId: string): Promise<PublicSupporterDTO[]> {
    const rows = await this.repos.payments.recentPublicSupporters(creatorUserId, 5);
    return rows.map((r) => {
      const handle = r.handle && isShoutoutPlatform(r.platform) ? { platform: r.platform, handle: r.handle } : null;
      return { name: r.name, platform: handle?.platform ?? null, handle: handle?.handle ?? null };
    });
  }
}

