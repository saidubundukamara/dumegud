import "server-only";
import { randomBytes } from "node:crypto";
import { formatDate } from "@/lib/dates";
import { formatSLE } from "@/lib/money";
import type { AccountDeletion } from "@/server/db/schema";
import type { EmailMessage, EmailService } from "@/server/integrations/email";
import { accountDeletedTemplate, accountDeletionCanceledTemplate, accountDeletionScheduledTemplate } from "@/server/integrations/email/templates";
import { availableBalanceMinor, type MonimeClient } from "@/server/integrations/monime";
import type { ObjectStorage } from "@/server/integrations/r2/storage";
import { profileChangeTags } from "@/server/lib/cache-tags";
import { ConflictError, ForbiddenError, ValidationError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import { enforceRateLimit, type RateLimitPolicy } from "@/server/lib/rate-limit";
import type { AccountDeletionRepository } from "@/server/repositories/AccountDeletionRepository";
import { isUniqueViolation } from "@/server/repositories/BaseRepository";
import type { CreatorProfileRepository } from "@/server/repositories/CreatorProfileRepository";
import type { CreatorWalletRepository } from "@/server/repositories/CreatorWalletRepository";
import type { HandleRepository } from "@/server/repositories/HandleRepository";
import type { KycRepository } from "@/server/repositories/KycRepository";
import type { LedgerRepository } from "@/server/repositories/LedgerRepository";
import type { PaymentRepository } from "@/server/repositories/PaymentRepository";
import type { PayoutMethodRepository } from "@/server/repositories/PayoutMethodRepository";
import type { PayoutRepository } from "@/server/repositories/PayoutRepository";
import type { ProductRepository } from "@/server/repositories/ProductRepository";
import type { RiskRepository } from "@/server/repositories/RiskRepository";
import type { UserRepository } from "@/server/repositories/UserRepository";
import { isStaff, type Actor } from "./actor";
import type { AuthService } from "./AuthService";
import { noAudit, type AuditLogger } from "./compliance";
import { accounts, forfeitJournal } from "./ledger";
import type { RiskService } from "./RiskService";
import { runInTransaction } from "./transaction";

const DAY = 24 * 60 * 60 * 1000;
export const DELETION_GRACE_DAYS = 30;
/** The most a creator can give up instead of withdrawing (Le 1.00): only rounding leftovers. */
export const FORFEIT_MAX_MINOR = 100;
/**
 * A checkout untouched for this long was abandoned (Monime sessions expire well before). If one
 * still completes later, the erasure re-check sees the money and holds the deletion.
 */
const UNSETTLED_LOOKBACK_MS = DAY;

type DeletionRepos = {
  accountDeletions: AccountDeletionRepository;
  users: UserRepository;
  profiles: CreatorProfileRepository;
  products: ProductRepository;
  payouts: PayoutRepository;
  payments: PaymentRepository;
  ledger: LedgerRepository;
  wallets: CreatorWalletRepository;
  payoutMethods: PayoutMethodRepository;
  kyc: KycRepository;
  risk: RiskRepository;
  handles: HandleRepository;
};

export type AccountDeletionServiceDeps = {
  repos: DeletionRepos;
  monime: Pick<MonimeClient, "getFinancialAccount" | "createInternalTransfer">;
  auth: Pick<AuthService, "confirmPassword">;
  email: EmailService;
  appBaseUrl: string;
  platformAccountId: () => string;
  /** Null while R2 isn't configured (nothing to delete then). */
  storage: Pick<ObjectStorage, "deleteObject"> | null;
  buckets: { public: string; kyc: string };
  risk?: Pick<RiskService, "raise">;
  audit?: AuditLogger;
  now?: () => Date;
  transaction?: typeof runInTransaction;
  rateLimit?: (policy: RateLimitPolicy, id: string) => Promise<void>;
};

export type DeletionCheckKey = "hold" | "payout" | "confirming" | "on-its-way" | "balance";

/** What the creator can do about an unmet check. */
export type DeletionFix = "support" | "wait" | "withdraw" | "forfeit";

export type DeletionCheck = { key: DeletionCheckKey; label: string; done: boolean; detail: string | null; fix: DeletionFix | null };

export type DeletionReadiness = {
  checks: DeletionCheck[];
  /** Everything is clear (a forfeitable remainder still needs the creator's consent). */
  canDelete: boolean;
  /** A remainder small enough to give up instead of withdrawing, or 0. */
  forfeitableMinor: number;
};

export type DeletionStatus = { eraseAfter: Date; forfeitedMinor: number } | null;

/**
 * A creator deleting their own account (see the plan in implementation.md, "Account deletion").
 *
 * Money first: deletion is refused while DuMeGud owes the creator anything, measured on the
 * ledger (what we owe overall) and the live Monime balance (what is really in their account),
 * failing closed if the live balance can't be read. A remainder of at most Le 1 can be given up.
 *
 * Then a grace period: the page goes offline and the creator is signed out at once, but nothing
 * personal is erased for 30 days, so signing back in can cancel. After that `eraseDue` anonymises
 * the account. Ledger, payment and audit rows are append-only and are kept.
 */
export class AccountDeletionService {
  private readonly repos: DeletionRepos;
  private readonly deps: AccountDeletionServiceDeps;
  private readonly audit: AuditLogger;
  private readonly now: () => Date;
  private readonly transaction: typeof runInTransaction;
  private readonly rateLimit: (policy: RateLimitPolicy, id: string) => Promise<void>;

  constructor(deps: AccountDeletionServiceDeps) {
    this.deps = deps;
    this.repos = deps.repos;
    this.audit = deps.audit ?? noAudit;
    this.now = deps.now ?? (() => new Date());
    this.transaction = deps.transaction ?? runInTransaction;
    this.rateLimit = deps.rateLimit ?? enforceRateLimit;
  }

  // ── Creator ───────────────────────────────────────────────────────────────────

  async status(actor: Actor): Promise<DeletionStatus> {
    const open = await this.repos.accountDeletions.findOpen(actor.userId);
    return open ? { eraseAfter: open.eraseAfter, forfeitedMinor: open.forfeitedMinor } : null;
  }

  async readiness(actor: Actor): Promise<DeletionReadiness> {
    return this.check(actor.userId);
  }

  /**
   * Schedules the deletion. `forfeit` is the creator's consent to give up a remainder of at most
   * Le 1 that can't be withdrawn. Returns the cache tags for the (now offline) public page.
   */
  async requestDeletion(
    actor: Actor,
    input: { handle: string; password?: string; forfeit?: boolean },
  ): Promise<{ eraseAfter: Date; tags: string[] }> {
    await this.rateLimit("login:email", `delete:${actor.userId}`);
    const [user, profile] = await Promise.all([this.repos.users.findById(actor.userId), this.repos.profiles.findByUserId(actor.userId)]);
    if (!user) throw new ConflictError("We couldn't find your account.");

    const typed = input.handle.trim().replace(/^@/, "").toLowerCase();
    const expected = profile?.handleLower ?? user.email.toLowerCase();
    if (typed !== expected) {
      throw new ValidationError(undefined, { handle: [profile ? `Type @${profile.handle} exactly to confirm.` : "Type your email address exactly to confirm."] });
    }
    if (user.passwordHash && !(await this.deps.auth.confirmPassword(actor, input.password ?? ""))) {
      throw new ValidationError(undefined, { password: ["That password isn't right."] });
    }

    const readiness = await this.check(actor.userId);
    const blocking = readiness.checks.find((c) => !c.done && !(c.key === "balance" && readiness.forfeitableMinor > 0));
    if (blocking) throw new ConflictError(blocking.detail ?? `Before deleting: ${blocking.label.toLowerCase()}.`);
    if (readiness.forfeitableMinor > 0 && !input.forfeit) {
      throw new ValidationError(undefined, { forfeit: [`Tick the box to give up the ${formatSLE(readiness.forfeitableMinor)} left in your account.`] });
    }

    const now = this.now();
    const eraseAfter = new Date(now.getTime() + DELETION_GRACE_DAYS * DAY);
    let deletion: AccountDeletion;
    try {
      deletion = await this.transaction(async (tx) => {
        const row = await this.repos.accountDeletions.insert(
          { userId: actor.userId, requestedAt: now, eraseAfter, forfeitedMinor: readiness.forfeitableMinor },
          tx,
        );
        if (profile && profile.status === "published") await this.repos.profiles.setStatusOwned(actor.userId, "unpublished", null, tx);
        await this.repos.users.bumpSessionVersion(actor.userId, tx);
        return row;
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError("Your account is already scheduled for deletion.");
      throw err;
    }
    await this.audit.log({
      actor,
      action: "account.deletion_requested",
      targetType: "user",
      targetId: actor.userId,
      after: { eraseAfter: eraseAfter.toISOString(), forfeitedMinor: deletion.forfeitedMinor },
    });

    // Outside the transaction: moving money is never done while holding database locks.
    if (deletion.forfeitedMinor > 0) await this.settleForfeit(deletion);

    await this.trySend(
      user.email,
      accountDeletionScheduledTemplate({ eraseOn: formatDate(eraseAfter), loginUrl: `${this.base()}/login` }),
    );
    return { eraseAfter, tags: profile ? profileChangeTags({ profileId: profile.id, handles: [profile.handleLower] }) : [] };
  }

  async cancelDeletion(actor: Actor): Promise<void> {
    const canceled = await this.repos.accountDeletions.cancel(actor.userId, this.now());
    if (!canceled) throw new ConflictError("Your account isn't scheduled for deletion.");
    await this.audit.log({ actor, action: "account.deletion_canceled", targetType: "user", targetId: actor.userId });
    const user = await this.repos.users.findById(actor.userId);
    if (user) await this.trySend(user.email, accountDeletionCanceledTemplate({ dashboardUrl: `${this.base()}/dashboard` }));
  }

  // ── Staff ─────────────────────────────────────────────────────────────────────

  /** The latest deletion request for a creator, for the admin creator page. */
  async latestForStaff(actor: Actor, userId: string): Promise<AccountDeletion | null> {
    if (!isStaff(actor.role)) throw new ForbiddenError();
    return this.repos.accountDeletions.latestForUser(userId);
  }

  // ── Erasure job ───────────────────────────────────────────────────────────────

  /** For the daily cron. Each request is handled on its own, so one failure doesn't stop the rest. */
  async eraseDue(opts: { batch?: number } = {}): Promise<{ erased: number; blocked: number; failed: number; tags: string[] }> {
    const due = await this.repos.accountDeletions.listDue(this.now(), opts.batch ?? 25);
    const result = { erased: 0, blocked: 0, failed: 0, tags: [] as string[] };
    for (const deletion of due) {
      try {
        const outcome = await this.erase(deletion);
        if (outcome === "blocked") result.blocked++;
        else if (outcome !== "skipped") {
          result.erased++;
          result.tags.push(...outcome.tags);
        }
      } catch (err) {
        result.failed++;
        logger.error("account erasure failed", { deletionId: deletion.id, err });
      }
    }
    return result;
  }

  private async erase(deletion: AccountDeletion): Promise<"blocked" | "skipped" | { tags: string[] }> {
    const userId = deletion.userId;
    if (deletion.forfeitedMinor > 0) await this.settleForfeit(deletion);

    // Money may have arrived during the grace period (a late webhook, a staff release).
    const readiness = await this.check(userId);
    if (!readiness.canDelete || readiness.forfeitableMinor > 0) {
      const reasons = readiness.checks.filter((c) => !c.done).map((c) => c.key);
      logger.warn("account erasure blocked", { deletionId: deletion.id, reasons });
      await this.deps.risk
        ?.raise({ ruleCode: "DELETION_BLOCKED_MONEY", subjectType: "creator", subjectId: userId, creatorId: userId, severity: "medium", evidence: { deletionId: deletion.id, reasons } })
        .catch((err) => logger.error("failed to raise deletion alert", { err }));
      return "blocked";
    }

    const user = await this.repos.users.findById(userId);
    if (!user) return "skipped";
    const originalEmail = user.email;
    const kycDocs = (await this.repos.kyc.listForUser(userId)).flatMap((k) => [k.idFrontKey, k.idBackKey, k.selfieKey]).filter((k): k is string => Boolean(k));

    const erased = await this.transaction(async (tx) => {
      const open = await this.repos.accountDeletions.lockOpen(deletion.id, tx);
      if (!open) return null; // cancelled or erased by another run meanwhile
      const before = await this.repos.profiles.anonymise(userId, placeholderHandle(), tx);
      if (before) await this.repos.handles.deleteHistory(before.handleLower, tx);
      await this.repos.products.unpublishAllForCreator(userId, tx);
      await this.repos.payoutMethods.eraseForUser(userId, tx);
      await this.repos.wallets.freeze(userId, tx);
      await this.repos.users.deleteSignInLinks(userId, tx);
      await this.repos.users.anonymise(userId, tx);
      await this.repos.accountDeletions.markErased(deletion.id, this.now(), tx);
      return { before };
    });
    if (!erased) return "skipped";
    await this.audit.log({ actor: null, action: "account.erased", targetType: "user", targetId: userId, after: { deletionId: deletion.id } });

    // Files after commit, best effort: a leftover object holds nothing the database still links to.
    const storage = this.deps.storage;
    if (storage) {
      const deletes = [
        ...(erased.before?.avatarKey ? [{ bucket: this.deps.buckets.public, key: erased.before.avatarKey }] : []),
        ...kycDocs.map((key) => ({ bucket: this.deps.buckets.kyc, key })),
      ];
      for (const d of deletes) {
        await storage.deleteObject(d.bucket, d.key).catch((err) => logger.warn("erasure: object not deleted", { bucket: d.bucket, err }));
      }
    }
    await this.trySend(originalEmail, accountDeletedTemplate());
    return { tags: erased.before ? profileChangeTags({ profileId: erased.before.id, handles: [erased.before.handleLower] }) : [] };
  }

  // ── Internals ─────────────────────────────────────────────────────────────────

  private async check(userId: string): Promise<DeletionReadiness> {
    const now = this.now();
    const [openCase, restrictions, openPayout, unsettled, pendingTransfer, payableBalance, wallet] = await Promise.all([
      this.repos.risk.openCaseForCreator(userId),
      this.repos.risk.activeRestrictions(userId, now),
      this.repos.payouts.findOpenForCreator(userId),
      this.repos.payments.countUnsettledForCreator(userId, new Date(now.getTime() - UNSETTLED_LOOKBACK_MS)),
      this.repos.payments.pendingTransferTotal(userId),
      this.repos.ledger.balance(accounts.creatorPayable(userId)),
      this.repos.wallets.findByUserId(userId),
    ]);
    // creator_payable is a liability (credits negative), so what we owe is its negation.
    const owed = Math.max(0, -payableBalance);

    let live: number | null = 0;
    if (wallet?.monimeFinancialAccountId && wallet.status !== "pending") {
      try {
        live = availableBalanceMinor(await this.deps.monime.getFinancialAccount(wallet.monimeFinancialAccountId));
      } catch (err) {
        logger.warn("deletion: live balance unavailable", { userId, err });
        live = null;
      }
    }

    const held = Boolean(openCase) || restrictions.length > 0;
    const inWallet = owed - pendingTransfer;
    const balanceZero = owed === 0 && live === 0;
    const forfeitable =
      !balanceZero && pendingTransfer === 0 && live !== null && inWallet > 0 && inWallet <= FORFEIT_MAX_MINOR && live === inWallet ? inWallet : 0;

    const checks: DeletionCheck[] = [
      {
        key: "hold",
        label: "Our team isn't reviewing your account",
        done: !held,
        detail: held ? "Our team is looking at your account right now. Contact support and we'll help you close it." : null,
        fix: held ? "support" : null,
      },
      {
        key: "payout",
        label: "No withdrawal on its way",
        done: !openPayout,
        detail: openPayout ? "Wait for your withdrawal to reach your phone." : null,
        fix: openPayout ? "wait" : null,
      },
      {
        key: "confirming",
        label: "No gifts or sales still being confirmed",
        done: unsettled === 0,
        detail: unsettled ? "Some gifts or sales are still being confirmed. This usually takes a few minutes." : null,
        fix: unsettled ? "wait" : null,
      },
      {
        key: "on-its-way",
        label: "No money on its way to your wallet",
        done: pendingTransfer === 0,
        detail: pendingTransfer ? `${formatSLE(pendingTransfer)} is on its way to your wallet. Withdraw it once it arrives.` : null,
        fix: pendingTransfer ? "wait" : null,
      },
      {
        key: "balance",
        label: "Your wallet is empty",
        done: balanceZero,
        detail:
          live === null
            ? "We couldn't check your balance just now. Try again in a few minutes."
            : balanceZero
              ? null
              : forfeitable
                ? `Only ${formatSLE(forfeitable)} is left. That's too little to send to a phone, so you can give it up and delete your account.`
                : `You still have ${formatSLE(Math.max(owed, live))} in your wallet. Withdraw it first.`,
        fix: live === null ? "wait" : balanceZero ? null : forfeitable ? "forfeit" : "withdraw",
      },
    ];
    const canDelete = checks.every((c) => c.done || (c.key === "balance" && forfeitable > 0));
    return { checks, canDelete, forfeitableMinor: forfeitable };
  }

  /**
   * Moves a given-up remainder to the platform account. The deletion row is the intent record:
   * the transfer key is tied to it (safe to repeat), and the journal is posted once it completed.
   * The erasure job retries until it has.
   */
  private async settleForfeit(deletion: AccountDeletion): Promise<void> {
    const owed = Math.max(0, -(await this.repos.ledger.balance(accounts.creatorPayable(deletion.userId))));
    if (owed === 0) return; // already settled
    const wallet = await this.repos.wallets.findByUserId(deletion.userId);
    if (!wallet?.monimeFinancialAccountId) return;
    try {
      const transfer = await this.deps.monime.createInternalTransfer(
        {
          amount: { currency: "SLE", value: deletion.forfeitedMinor },
          sourceFinancialAccount: { id: wallet.monimeFinancialAccountId },
          destinationFinancialAccount: { id: this.deps.platformAccountId() },
          description: "Remainder given up on account deletion",
          metadata: { deletionId: deletion.id, type: "deletion_forfeit" },
        },
        `forfeit-${deletion.id}`,
      );
      if (transfer.status !== "completed") return; // the erasure job tries again
      await this.transaction((tx) =>
        this.repos.ledger.postJournal(forfeitJournal({ deletionId: deletion.id, creatorId: deletion.userId, amountMinor: deletion.forfeitedMinor }), tx),
      );
    } catch (err) {
      logger.error("deletion forfeit transfer failed", { deletionId: deletion.id, err });
    }
  }

  private base(): string {
    return this.deps.appBaseUrl.replace(/\/$/, "");
  }

  /** Email is best-effort: a provider outage must not undo the deletion. */
  private async trySend(to: string, message: Omit<EmailMessage, "to">): Promise<void> {
    try {
      await this.deps.email.send({ to, ...message });
    } catch (err) {
      logger.error("failed to send account deletion email", { err });
    }
  }
}

/** A handle nobody would pick, so the real one is free again right away. */
function placeholderHandle(): string {
  return `deleted_${randomBytes(5).toString("hex")}`;
}
