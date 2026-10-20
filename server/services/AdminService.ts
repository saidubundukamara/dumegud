import "server-only";
import { z } from "zod";
import type { PaymentStatus, Role, UserStatus } from "@/server/db/schema";
import { availableBalanceMinor, type MonimeClient } from "@/server/integrations/monime";
import { parseMonimeEvent } from "@/server/integrations/monime/webhook";
import { decryptField } from "@/server/lib/crypto";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import type { AdminRepository } from "@/server/repositories/AdminRepository";
import type { KycRepository } from "@/server/repositories/KycRepository";
import type { PayoutMethodRepository } from "@/server/repositories/PayoutMethodRepository";
import type { PayoutRepository } from "@/server/repositories/PayoutRepository";
import type { PlatformSettingsRepository } from "@/server/repositories/PlatformSettingsRepository";
import type { RiskRepository } from "@/server/repositories/RiskRepository";
import type { UserRepository } from "@/server/repositories/UserRepository";
import { isStaff, type Actor } from "./actor";
import type { AuditLogger } from "./compliance";
import type { JobService } from "./JobService";
import type { PayoutService } from "./PayoutService";
import type { SettlementService } from "./SettlementService";
import type { TransferService } from "./TransferService";
import type { WebhookService } from "./WebhookService";

type AdminRepos = {
  admin: AdminRepository;
  users: UserRepository;
  kyc: KycRepository;
  payoutMethods: PayoutMethodRepository;
  payouts: PayoutRepository;
  risk: RiskRepository;
  settings: PlatformSettingsRepository;
};

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
};

const ruleParamsSchema = z.record(z.string().regex(/^[a-zA-Z]{1,40}$/), z.number().finite().min(0).max(1e12));

/**
 * Admin dashboard (implementation.md Phase 8): read models plus the staff operations that
 * aren't owned by a domain service. Every method checks the role itself (defence in depth on
 * top of the DAL) and every mutation writes an audit row. Sensitive ones also need step-up,
 * enforced at the action layer.
 */
export class AdminService {
  private readonly repos: AdminRepos;
  private readonly now: () => Date;

  constructor(private readonly deps: AdminServiceDeps) {
    this.repos = deps.repos;
    this.now = deps.now ?? (() => new Date());
  }

  // ── Read ──────────────────────────────────────────────────────────────────────

  async overview(actor: Actor) {
    this.staff(actor);
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

  /** Cron run history: the latest run of each job and the most recent runs. */
  async jobHistory(actor: Actor) {
    this.staff(actor);
    const history = this.deps.jobs ? await this.deps.jobs.history(20) : { latest: [], recent: [] };
    return { ...history, now: this.now() };
  }

  async searchCreators(actor: Actor, term: string) {
    this.staff(actor);
    return this.repos.admin.searchCreators(term.slice(0, 120));
  }

  async creatorDetail(actor: Actor, userId: string) {
    this.staff(actor);
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
      user: { id: row.user.id, email: row.user.email, name: row.user.name, role: row.user.role, status: row.user.status, createdAt: row.user.createdAt, emailVerified: row.user.emailVerified !== null },
      profile: row.profile,
      wallet: row.wallet ? { status: row.wallet.status, accountId: row.wallet.monimeFinancialAccountId } : null,
      kyc: kyc ? { id: kyc.id, status: kyc.status, legalName: decryptField(kyc.legalNameEnc) } : null,
      payoutMethod: method ? { providerId: method.providerId, last3: method.msisdnLast3, holderName: method.holderName, status: method.status, nameMatch: method.nameMatch } : null,
      payouts,
      payments,
      restrictions,
    };
  }

  async listPayments(actor: Actor, filter: { status?: PaymentStatus; kind?: "contribution" | "order"; creatorId?: string; from?: Date; to?: Date }) {
    this.staff(actor);
    return this.repos.admin.listPayments(filter);
  }

  async paymentDetail(actor: Actor, paymentId: string) {
    this.staff(actor);
    const payment = await this.repos.admin.findPayment(paymentId);
    if (!payment) throw new NotFoundError();
    return { payment, ...(await this.repos.admin.paymentTimeline(paymentId)) };
  }

  async stuckPayouts(actor: Actor) {
    this.staff(actor);
    return this.repos.admin.stuckPayouts(new Date(this.now().getTime() - 30 * 60_000));
  }

  async webhookEvents(actor: Actor, status?: "failed" | "dead" | "ignored" | "processed" | "processing") {
    this.staff(actor);
    return this.repos.admin.webhookEvents(status);
  }

  async auditLog(actor: Actor, filter: Parameters<AdminRepository["auditLog"]>[0]) {
    this.staff(actor);
    return this.repos.admin.auditLog(filter, 200);
  }

  // ── Users ─────────────────────────────────────────────────────────────────────

  /** Suspending/closing revokes every session (sessionVersion bump in the repository). */
  async setUserStatus(actor: Actor, userId: string, status: UserStatus, reason: string) {
    this.staff(actor);
    if (status === "closed" && actor.role !== "super_admin") throw new ForbiddenError("Only a super admin can close accounts.");
    if (userId === actor.userId) throw new ForbiddenError("You can't change your own account status.");
    const before = await this.repos.users.findById(userId);
    if (!before) throw new NotFoundError();
    if (isStaff(before.role) && actor.role !== "super_admin") throw new ForbiddenError("Only a super admin can change staff accounts.");
    await this.repos.users.setStatus(userId, status);
    await this.deps.audit.log({ actor, action: "user.status", targetType: "user", targetId: userId, before: { status: before.status }, after: { status, reason } });
  }

  async setUserRole(actor: Actor, userId: string, role: Role) {
    if (actor.role !== "super_admin") throw new ForbiddenError("Only a super admin can change roles.");
    if (userId === actor.userId) throw new ForbiddenError("You can't change your own role.");
    const before = await this.repos.users.findById(userId);
    if (!before) throw new NotFoundError();
    await this.repos.users.setRole(userId, role);
    await this.deps.audit.log({ actor, action: "user.role", targetType: "user", targetId: userId, before: { role: before.role }, after: { role } });
  }

  // ── Payments & payouts ────────────────────────────────────────────────────────

  async releasePaymentReview(actor: Actor, paymentId: string, note: string) {
    this.staff(actor);
    if (!note.trim()) throw new ValidationError("Record why this payment is being released.");
    const payment = await this.deps.settlement.releaseFromReview(paymentId, { source: "admin", detail: { by: actor.userId, note } });
    await this.deps.audit.log({ actor, action: "payment.release_review", targetType: "payment", targetId: paymentId, before: { status: "under_review" }, after: { status: payment.status, note } });
    return payment;
  }

  async resyncPayment(actor: Actor, paymentId: string) {
    this.staff(actor);
    const payment = await this.deps.settlement.resync(paymentId);
    await this.deps.audit.log({ actor, action: "payment.resync", targetType: "payment", targetId: paymentId, after: { status: payment?.status ?? null } });
    return payment;
  }

  async retryTransfer(actor: Actor, paymentId: string) {
    this.staff(actor);
    const pending = await this.deps.transfers.refreshPending(paymentId);
    const outcome = pending === "skipped" ? await this.deps.transfers.settleToCreator(paymentId) : pending;
    await this.deps.audit.log({ actor, action: "payment.retry_transfer", targetType: "payment", targetId: paymentId, after: { outcome } });
    return outcome;
  }

  async redispatchPayout(actor: Actor, payoutId: string) {
    this.staff(actor);
    const payout = await this.deps.payouts.dispatch(payoutId);
    await this.deps.audit.log({ actor, action: "payout.redispatch", targetType: "payout", targetId: payoutId, after: { status: payout.status } });
    return payout;
  }

  async resyncPayout(actor: Actor, payoutId: string) {
    this.staff(actor);
    await this.deps.payouts.syncFromMonime(payoutId);
    await this.deps.audit.log({ actor, action: "payout.resync", targetType: "payout", targetId: payoutId });
  }

  async replayWebhook(actor: Actor, eventRowId: string) {
    this.staff(actor);
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

  async updateRule(actor: Actor, code: string, input: { params: unknown; severity: "low" | "medium" | "high"; active: boolean }) {
    if (actor.role !== "super_admin") throw new ForbiddenError("Only a super admin can change risk rules.");
    const params = ruleParamsSchema.safeParse(input.params);
    if (!params.success) throw new ValidationError("Rule parameters must be named numbers.");
    const before = (await this.repos.risk.activeRules()).find((r) => r.code === code) ?? null;
    const after = await this.repos.risk.updateRule(code, { params: params.data, severity: input.severity, active: input.active, updatedBy: actor.userId });
    if (!after) throw new NotFoundError();
    await this.deps.audit.log({ actor, action: "risk_rule.update", targetType: "risk_rule", targetId: code, before, after });
  }

  async listSettings(actor: Actor) {
    this.staff(actor);
    return this.repos.settings.allWithVersion();
  }

  async listRules(actor: Actor) {
    this.staff(actor);
    return this.repos.risk.allRules();
  }

  /** CSV of the filtered audit log (super admin; the export itself is audited). */
  async exportAuditCsv(actor: Actor, filter: Parameters<AdminRepository["auditLog"]>[0]): Promise<string> {
    if (actor.role !== "super_admin") throw new ForbiddenError("Only a super admin can export the audit log.");
    const rows = await this.repos.admin.auditLog(filter, 5000);
    await this.deps.audit.log({ actor, action: "audit.export", targetType: "audit_log", targetId: null, after: { filter, rows: rows.length } });
    const header = ["created_at", "actor_id", "actor_role", "action", "target_type", "target_id", "before", "after"];
    const cell = (v: unknown) => {
      const text = v === null || v === undefined ? "" : typeof v === "string" ? v : v instanceof Date ? v.toISOString() : JSON.stringify(v);
      // Neutralise spreadsheet formulas and quote every cell.
      const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    return [header.join(","), ...rows.map((r) => [r.createdAt, r.actorId, r.actorRole, r.action, r.targetType, r.targetId, r.before, r.after].map(cell).join(","))].join("\n");
  }

  private staff(actor: Actor) {
    if (!isStaff(actor.role)) throw new ForbiddenError();
  }
}
