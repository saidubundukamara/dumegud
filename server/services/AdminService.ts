import "server-only";
import { z } from "zod";
import type { CreatorProfile, PayoutStatus, User, UserStatus } from "@/server/db/schema";
import { availableBalanceMinor, type MonimeClient } from "@/server/integrations/monime";
import { parseMonimeEvent } from "@/server/integrations/monime/webhook";
import { decryptField } from "@/server/lib/crypto";
import { decodeCursor, toPage } from "@/server/lib/cursor";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import type { AdminRepository, AuditFilter, PaymentFilter, WebhookStatusFilter } from "@/server/repositories/AdminRepository";
import type { CreatorProfileRepository } from "@/server/repositories/CreatorProfileRepository";
import type { KycRepository } from "@/server/repositories/KycRepository";
import type { PayoutMethodRepository } from "@/server/repositories/PayoutMethodRepository";
import type { PayoutRepository } from "@/server/repositories/PayoutRepository";
import type { PlatformSettingsRepository } from "@/server/repositories/PlatformSettingsRepository";
import type { RiskRepository } from "@/server/repositories/RiskRepository";
import type { UserRepository } from "@/server/repositories/UserRepository";
import { assertPermission, can, type AdminActor } from "./actor";
import type { AuditLogger } from "./compliance";
import type { JobService } from "./JobService";
import type { PayoutService } from "./PayoutService";
import type { SettlementService } from "./SettlementService";
import type { TransferService } from "./TransferService";
import { runInTransaction } from "./transaction";
import type { WebhookService } from "./WebhookService";

type AdminRepos = {
  admin: AdminRepository;
  users: UserRepository;
  kyc: KycRepository;
  payoutMethods: PayoutMethodRepository;
  payouts: PayoutRepository;
  risk: RiskRepository;
  settings: PlatformSettingsRepository;
  profiles: CreatorProfileRepository;
};

const PAGE = 30;

export type AdminServiceDeps = {
  repos: AdminRepos;
  audit: AuditLogger;
  monime: MonimeClient;
  platformAccountId: () => string;
  settlement: Pick<SettlementService, "releaseFromReview" | "resync">;
  transfers: Pick<TransferService, "settleToCreator" | "refreshPending">;
  payouts: Pick<PayoutService, "dispatch" | "syncFromMonime">;
  webhooks: () => Pick<WebhookService, "replay">;
  jobs?: Pick<JobService, "history">;
  now?: () => Date;
  transaction?: typeof runInTransaction;
};

/** Erasure leaves the row with a placeholder address; nothing about it may be changed again. */
const isErased = (user: User) => user.email.endsWith("@users.invalid");

const ruleParamsSchema = z.record(z.string().regex(/^[a-zA-Z]{1,40}$/), z.number().finite().min(0).max(1e12));

/**
 * Admin dashboard (implementation.md Phase 8): read models plus the staff operations that
 * aren't owned by a domain service. Every method checks its permission itself (defence in depth on
 * top of the DAL) and every mutation writes an audit row. Sensitive ones also need step-up,
 * enforced at the action layer.
 */
export class AdminService {
  private readonly repos: AdminRepos;
  private readonly now: () => Date;
  private readonly transaction: typeof runInTransaction;

  constructor(private readonly deps: AdminServiceDeps) {
    this.repos = deps.repos;
    this.now = deps.now ?? (() => new Date());
    this.transaction = deps.transaction ?? runInTransaction;
  }

  // ── Read ──────────────────────────────────────────────────────────────────────

  async overview(actor: AdminActor) {
    assertPermission(actor, "overview.view");
    const since = new Date(this.now().getTime() - 30 * 86_400_000);
    const stats = await this.repos.admin.overview(since);
    let platformBalanceMinor: number | null = null;
    try {
      platformBalanceMinor = availableBalanceMinor(await this.deps.monime.getFinancialAccount(this.deps.platformAccountId()));
    } catch (err) {
      logger.warn("platform balance unavailable", { err });
    }
    return { ...stats, platformAccountId: this.deps.platformAccountId(), platformBalanceMinor };
  }

  /** Sidebar badges: only the queues this admin can open (null = hidden). */
  async queueCounts(actor: AdminActor) {
    const c = await this.repos.admin.queueCounts();
    const show = (permission: Parameters<typeof can>[1], value: number) => (can(actor, permission) ? value : null);
    return {
      kyc: show("kyc.view", c.kyc),
      payouts: show("payouts.view", c.payouts),
      products: show("products.view", c.products),
      reports: show("reports.view", c.reports),
      risk: show("risk.view", c.risk),
      webhooks: show("webhooks.view", c.webhooks),
    };
  }

  /**
   * Labels for ids shown on a page the admin already opened (creator handle or email, admin
   * name). The page itself checked its view permission; this only needs an admin.
   */
  async creatorLabels(actor: AdminActor, userIds: (string | null)[]): Promise<Map<string, string>> {
    if (actor?.kind !== "admin") throw new ForbiddenError();
    return this.repos.admin.creatorLabels(userIds.filter((id): id is string => Boolean(id)));
  }

  async adminNames(actor: AdminActor, adminIds: (string | null | undefined)[]): Promise<Map<string, string>> {
    if (actor?.kind !== "admin") throw new ForbiddenError();
    return this.repos.admin.adminNames(adminIds.filter((id): id is string => Boolean(id)));
  }

  /** Cron run history: the latest run of each job and the most recent runs. */
  async jobHistory(actor: AdminActor) {
    assertPermission(actor, "webhooks.view");
    const history = this.deps.jobs ? await this.deps.jobs.history(20) : { latest: [], recent: [] };
    return { ...history, now: this.now() };
  }

  async searchCreators(actor: AdminActor, term: string, limit = 50) {
    assertPermission(actor, "creators.view");
    return this.repos.admin.searchCreators(term.slice(0, 120), limit);
  }

  /** The creators list: a search (handle prefix, exact email or id), newest accounts first. */
  async searchCreatorsPage(actor: AdminActor, term: string, cursor: unknown) {
    assertPermission(actor, "creators.view");
    return toPage(await this.repos.admin.searchCreators(term.slice(0, 120), PAGE + 1, undefined, decodeCursor(cursor)), PAGE, (r) => r.createdAt);
  }

  async creatorDetail(actor: AdminActor, userId: string) {
    assertPermission(actor, "creators.view");
    const row = await this.repos.admin.creatorDetail(userId);
    if (!row) throw new NotFoundError();
    const [kyc, method, payouts, payments, restrictions] = await Promise.all([
      this.repos.kyc.latestForUser(userId),
      this.repos.payoutMethods.current(userId),
      this.repos.payouts.listForCreator(userId, 20),
      this.repos.admin.listPayments({ creatorId: userId }, 20),
      this.repos.risk.activeRestrictions(userId, this.now()),
    ]);
    return {
      user: { id: row.user.id, email: row.user.email, name: row.user.name, status: row.user.status, createdAt: row.user.createdAt, emailVerified: row.user.emailVerified !== null },
      profile: row.profile,
      wallet: row.wallet ? { status: row.wallet.status, accountId: row.wallet.monimeFinancialAccountId } : null,
      kyc: kyc ? { id: kyc.id, status: kyc.status, legalName: decryptField(kyc.legalNameEnc) } : null,
      payoutMethod: method ? { providerId: method.providerId, last3: method.msisdnLast3, holderName: method.holderName, status: method.status, nameMatch: method.nameMatch } : null,
      payouts,
      payments,
      restrictions,
    };
  }

  async listPayments(actor: AdminActor, filter: Omit<PaymentFilter, "cursor">, cursor: unknown) {
    assertPermission(actor, "transactions.view");
    const page = toPage(await this.repos.admin.listPayments({ ...filter, cursor: decodeCursor(cursor) }, PAGE + 1), PAGE, (p) => p.createdAt);
    const labels = await this.repos.admin.creatorLabels(page.rows.map((p) => p.creatorId));
    return { rows: page.rows.map((p) => ({ ...p, creatorLabel: labels.get(p.creatorId) ?? null })), next: page.next };
  }

  async listPayouts(actor: AdminActor, filter: { status?: PayoutStatus; creatorId?: string }, cursor: unknown) {
    assertPermission(actor, "payouts.view");
    const page = toPage(await this.repos.admin.listPayouts({ ...filter, cursor: decodeCursor(cursor) }, PAGE + 1), PAGE, (p) => p.createdAt);
    const labels = await this.repos.admin.creatorLabels(page.rows.map((p) => p.creatorId));
    return { rows: page.rows.map((p) => ({ ...p, creatorLabel: labels.get(p.creatorId) ?? null })), next: page.next };
  }

  /** A payout with who approved it and its creator (the audit trail needs audit.view: AuditTrail). */
  async payoutDetail(actor: AdminActor, payoutId: string) {
    assertPermission(actor, "payouts.view");
    const payout = await this.repos.payouts.findById(payoutId);
    if (!payout) throw new NotFoundError();
    const approvals = (payout.approvals as { by: string; at: string }[]) ?? [];
    // Reviewers compare the payout name with the ID, so approvers see the approved legal name too.
    const seesIdName = can(actor, "kyc.view") || can(actor, "payouts.approve");
    const [labels, names, kyc] = await Promise.all([
      this.repos.admin.creatorLabels([payout.creatorId]),
      this.repos.admin.adminNames([...approvals.map((a) => a.by), payout.reviewerId ?? ""]),
      seesIdName ? this.repos.kyc.approvedForUser(payout.creatorId) : null,
    ]);
    return {
      payout,
      /** undefined = not shown to this admin; null = no approved ID. */
      idName: seesIdName ? (kyc ? decryptField(kyc.legalNameEnc) : null) : undefined,
      creatorLabel: labels.get(payout.creatorId) ?? null,
      approvals: approvals.map((a) => ({ ...a, name: names.get(a.by) ?? "Former admin" })),
      reviewerName: payout.reviewerId ? (names.get(payout.reviewerId) ?? "Former admin") : null,
    };
  }

  async paymentDetail(actor: AdminActor, paymentId: string) {
    assertPermission(actor, "transactions.view");
    const payment = await this.repos.admin.findPayment(paymentId);
    if (!payment) throw new NotFoundError();
    return { payment, ...(await this.repos.admin.paymentTimeline(paymentId)) };
  }

  async stuckPayouts(actor: AdminActor) {
    assertPermission(actor, "payouts.view");
    return this.repos.admin.stuckPayouts(new Date(this.now().getTime() - 30 * 60_000));
  }

  async webhookEvents(actor: AdminActor, status: WebhookStatusFilter | undefined, cursor: unknown) {
    assertPermission(actor, "webhooks.view");
    return toPage(await this.repos.admin.webhookEvents(status, PAGE + 1, undefined, decodeCursor(cursor)), PAGE, (e) => e.receivedAt);
  }

  /** One webhook event with its payload (Monime masks phone numbers before sending). */
  async webhookEvent(actor: AdminActor, eventRowId: string) {
    assertPermission(actor, "webhooks.view");
    const event = await this.repos.admin.findWebhookEvent(eventRowId);
    if (!event) throw new NotFoundError();
    return event;
  }

  async auditLog(actor: AdminActor, filter: Omit<AuditFilter, "cursor">, cursor: unknown, limit = 50) {
    assertPermission(actor, "audit.view");
    return toPage(await this.repos.admin.auditLog({ ...filter, cursor: decodeCursor(cursor) }, limit + 1), limit, (r) => r.createdAt);
  }

  // ── Users ─────────────────────────────────────────────────────────────────────

  /** Suspending/closing revokes every session (sessionVersion bump in the repository). */
  async setUserStatus(actor: AdminActor, userId: string, status: UserStatus, reason: string) {
    assertPermission(actor, "creators.status");
    if (status === "closed") assertPermission(actor, "creators.close", "You don't have permission to close accounts.");
    // Checked against the locked row: an erasure in between must win.
    const before = await this.transaction(async (tx) => {
      const user = await this.repos.users.lockById(userId, tx);
      if (!user) throw new NotFoundError();
      if (isErased(user)) throw new ConflictError("This account was deleted.");
      await this.repos.users.setStatus(userId, status, tx);
      return user;
    });
    await this.deps.audit.log({ actor, action: "user.status", targetType: "user", targetId: userId, before: { status: before.status }, after: { status, reason } });
  }

  /**
   * Move a creator's risk tier (it picks which limits apply). `expected` is the tier the admin
   * saw: if it changed in the meantime (a risk rule raised it), nothing is written.
   */
  async setRiskTier(actor: AdminActor, userId: string, expected: CreatorProfile["riskTier"], tier: CreatorProfile["riskTier"], reason: string) {
    assertPermission(actor, "creators.status");
    if (!reason.trim()) throw new ValidationError("Give a reason.");
    if (expected === tier) return;
    if (!(await this.repos.profiles.raiseRiskTier(userId, expected, tier))) {
      throw new ConflictError("The risk tier changed since you opened this page. Reload and try again.");
    }
    await this.deps.audit.log({ actor, action: "creator.risk_tier", targetType: "user", targetId: userId, before: { riskTier: expected }, after: { riskTier: tier, reason } });
  }

  // ── Payments & payouts ────────────────────────────────────────────────────────

  async releasePaymentReview(actor: AdminActor, paymentId: string, note: string) {
    assertPermission(actor, "payments.manage");
    if (!note.trim()) throw new ValidationError("Record why this payment is being released.");
    const payment = await this.deps.settlement.releaseFromReview(paymentId, { source: "admin", detail: { by: actor.adminId, note } });
    await this.deps.audit.log({ actor, action: "payment.release_review", targetType: "payment", targetId: paymentId, before: { status: "under_review" }, after: { status: payment.status, note } });
    return payment;
  }

  async resyncPayment(actor: AdminActor, paymentId: string) {
    assertPermission(actor, "payments.manage");
    const payment = await this.deps.settlement.resync(paymentId);
    await this.deps.audit.log({ actor, action: "payment.resync", targetType: "payment", targetId: paymentId, after: { status: payment?.status ?? null } });
    return payment;
  }

  async retryTransfer(actor: AdminActor, paymentId: string) {
    assertPermission(actor, "payments.manage");
    const pending = await this.deps.transfers.refreshPending(paymentId);
    const outcome = pending === "skipped" ? await this.deps.transfers.settleToCreator(paymentId) : pending;
    await this.deps.audit.log({ actor, action: "payment.retry_transfer", targetType: "payment", targetId: paymentId, after: { outcome } });
    return outcome;
  }

  async redispatchPayout(actor: AdminActor, payoutId: string) {
    assertPermission(actor, "payouts.operate");
    const payout = await this.deps.payouts.dispatch(payoutId);
    await this.deps.audit.log({ actor, action: "payout.redispatch", targetType: "payout", targetId: payoutId, after: { status: payout.status } });
    return payout;
  }

  async resyncPayout(actor: AdminActor, payoutId: string) {
    assertPermission(actor, "payouts.operate");
    await this.deps.payouts.syncFromMonime(payoutId);
    await this.deps.audit.log({ actor, action: "payout.resync", targetType: "payout", targetId: payoutId });
  }

  async replayWebhook(actor: AdminActor, eventRowId: string) {
    assertPermission(actor, "webhooks.replay");
    const event = await this.repos.admin.findWebhookEvent(eventRowId);
    if (!event) throw new NotFoundError();
    let status: string;
    try {
      status = await this.deps.webhooks().replay(eventRowId, (payload) => parseMonimeEvent(JSON.stringify(payload)));
    } catch (err) {
      throw new ConflictError(err instanceof Error ? err.message : "Replay failed.");
    }
    await this.deps.audit.log({ actor, action: "webhook.replay", targetType: "webhook_event", targetId: eventRowId, before: { status: event.status }, after: { status } });
    return status;
  }

  // ── Rules & audit export ──────────────────────────────────────────────────────

  /** `seenAt` is the rule's updatedAt as the admin saw it: a change in between is refused. */
  async updateRule(actor: AdminActor, code: string, input: { params: unknown; severity: "low" | "medium" | "high"; active: boolean; seenAt?: Date }) {
    assertPermission(actor, "risk.rules", "You don't have permission to change risk rules.");
    const params = ruleParamsSchema.safeParse(input.params);
    if (!params.success) throw new ValidationError("Rule parameters must be named numbers.");
    const { before, after } = await this.transaction(async (tx) => {
      const before = await this.repos.risk.lockRule(code, tx);
      if (!before) throw new NotFoundError();
      if (input.seenAt && before.updatedAt.getTime() !== input.seenAt.getTime()) {
        throw new ConflictError("Someone else changed this rule since you opened the page. Reload and try again.");
      }
      const after = await this.repos.risk.updateRule(code, { params: params.data, severity: input.severity, active: input.active, updatedBy: actor.adminId }, tx);
      return { before, after };
    });
    await this.deps.audit.log({ actor, action: "risk_rule.update", targetType: "risk_rule", targetId: code, before, after });
  }

  async listSettings(actor: AdminActor) {
    assertPermission(actor, "settings.view");
    return this.repos.settings.allWithVersion();
  }

  /** Saved versions of one setting, newest first, with who saved each. */
  async settingsHistory(actor: AdminActor, key: string) {
    assertPermission(actor, "settings.view");
    const rows = await this.repos.admin.settingsHistory(key, 20);
    const names = await this.repos.admin.adminNames(rows.map((r) => r.changedBy ?? ""));
    return rows.map((r) => ({ ...r, changedByName: r.changedBy ? (names.get(r.changedBy) ?? "Former admin") : "Seed" }));
  }

  async listRules(actor: AdminActor) {
    assertPermission(actor, "risk.view");
    return this.repos.risk.allRules();
  }

  /** CSV of the filtered audit log (super admin; the export itself is audited). */
  async exportAuditCsv(actor: AdminActor, filter: Omit<AuditFilter, "cursor">): Promise<string> {
    assertPermission(actor, "audit.export", "You don't have permission to export the audit log.");
    const rows = await this.repos.admin.auditLog(filter, 5000);
    await this.deps.audit.log({ actor, action: "audit.export", targetType: "audit_log", targetId: null, after: { filter, rows: rows.length } });
    const header = ["created_at", "actor_id", "actor_type", "actor_role", "action", "target_type", "target_id", "before", "after"];
    const cell = (v: unknown) => {
      const text = v === null || v === undefined ? "" : typeof v === "string" ? v : v instanceof Date ? v.toISOString() : JSON.stringify(v);
      // Neutralise spreadsheet formulas and quote every cell.
      const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    return [header.join(","), ...rows.map((r) => [r.createdAt, r.actorId, r.actorType, r.actorRole, r.action, r.targetType, r.targetId, r.before, r.after].map(cell).join(","))].join("\n");
  }
}
