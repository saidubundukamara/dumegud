import "server-only";
import { and, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import {
  admins,
  auditLogs,
  contentReports,
  creatorProfiles,
  creatorWallets,
  kycSubmissions,
  ledgerEntries,
  ledgerJournals,
  paymentEvents,
  payments,
  payouts,
  platformSettingsHistory,
  products,
  riskAlerts,
  riskCases,
  users,
  webhookEvents,
  type PaymentStatus,
  type PayoutStatus,
} from "@/server/db/schema";
import type { Cursor } from "@/server/lib/cursor";
import { BaseRepository } from "./BaseRepository";
import { newestFirst, olderThan } from "./keyset";

export type PaymentFilter = { status?: PaymentStatus; kind?: "contribution" | "order"; creatorId?: string; from?: Date; to?: Date; cursor?: Cursor | null };
export type PayoutFilter = { status?: PayoutStatus; creatorId?: string; cursor?: Cursor | null };
export type WebhookStatusFilter = "failed" | "dead" | "ignored" | "processed" | "processing";
export type AuditFilter = { actorId?: string; targetType?: string; targetId?: string; action?: string; from?: Date; to?: Date; cursor?: Cursor | null };

const n = (v: unknown) => Number(v ?? 0);

/** Read models for the admin dashboard. Bounded queries only (limits ≤ 200). */
export class AdminRepository extends BaseRepository {
  async overview(since: Date, tx?: Executor) {
    const db = this.exec(tx);
    const count = async (q: Promise<{ v: string }[]>) => n((await q)[0]?.v);
    const [registrations, published, gtv, revenue, productSales, pendingTransfers, payoutsInReview, openAlerts, openReports, failedWebhooks, pendingKyc, openDriftAlerts] =
      await Promise.all([
        count(db.select({ v: sql<string>`count(*)` }).from(users).where(gte(users.createdAt, since))),
        count(db.select({ v: sql<string>`count(*)` }).from(creatorProfiles).where(eq(creatorProfiles.status, "published"))),
        count(db.select({ v: sql<string>`coalesce(sum(${payments.grossMinor}), 0)` }).from(payments).where(and(eq(payments.status, "succeeded"), gte(payments.settledAt, since)))),
        count(db.select({ v: sql<string>`coalesce(sum(${payments.platformFeeMinor}), 0)` }).from(payments).where(and(eq(payments.status, "succeeded"), gte(payments.settledAt, since)))),
        count(
          db
            .select({ v: sql<string>`coalesce(sum(${payments.grossMinor}), 0)` })
            .from(payments)
            .where(and(eq(payments.status, "succeeded"), eq(payments.kind, "order"), gte(payments.settledAt, since))),
        ),
        count(db.select({ v: sql<string>`count(*)` }).from(payments).where(and(eq(payments.status, "succeeded"), eq(payments.settlementFrozen, false)))),
        count(db.select({ v: sql<string>`count(*)` }).from(payouts).where(eq(payouts.status, "in_review"))),
        count(db.select({ v: sql<string>`count(*)` }).from(riskAlerts).where(eq(riskAlerts.status, "open"))),
        count(db.select({ v: sql<string>`count(*)` }).from(contentReports).where(eq(contentReports.status, "open"))),
        count(db.select({ v: sql<string>`count(*)` }).from(webhookEvents).where(inArray(webhookEvents.status, ["failed", "dead"]))),
        count(db.select({ v: sql<string>`count(*)` }).from(kycSubmissions).where(eq(kycSubmissions.status, "pending"))),
        count(db.select({ v: sql<string>`count(*)` }).from(riskAlerts).where(and(eq(riskAlerts.status, "open"), eq(riskAlerts.ruleCode, "LEDGER_DRIFT")))),
      ]);
    return { registrations, published, gtvMinor: gtv, revenueMinor: revenue, productSalesMinor: productSales, pendingTransfers, payoutsInReview, openAlerts, openReports, failedWebhooks, pendingKyc, openDriftAlerts };
  }

  /** The sidebar's live counts: what's waiting for a person in each queue. */
  async queueCounts(tx?: Executor) {
    const db = this.exec(tx);
    const count = async (q: Promise<{ v: string }[]>) => n((await q)[0]?.v);
    const [kyc, payoutsInReview, productsInReview, reports, alerts, cases, webhooks] = await Promise.all([
      count(db.select({ v: sql<string>`count(*)` }).from(kycSubmissions).where(eq(kycSubmissions.status, "pending"))),
      count(db.select({ v: sql<string>`count(*)` }).from(payouts).where(eq(payouts.status, "in_review"))),
      count(db.select({ v: sql<string>`count(*)` }).from(products).where(eq(products.status, "pending_review"))),
      count(db.select({ v: sql<string>`count(*)` }).from(contentReports).where(eq(contentReports.status, "open"))),
      count(db.select({ v: sql<string>`count(*)` }).from(riskAlerts).where(eq(riskAlerts.status, "open"))),
      count(db.select({ v: sql<string>`count(*)` }).from(riskCases).where(eq(riskCases.status, "awaiting_approval"))),
      count(db.select({ v: sql<string>`count(*)` }).from(webhookEvents).where(inArray(webhookEvents.status, ["failed", "dead"]))),
    ]);
    return { kyc, payouts: payoutsInReview, products: productsInReview, reports, risk: alerts + cases, webhooks };
  }

  /** Handle (or email) per creator id, to label rows that only carry an id. */
  async creatorLabels(userIds: string[], tx?: Executor): Promise<Map<string, string>> {
    const ids = [...new Set(userIds)].filter(Boolean);
    if (!ids.length) return new Map();
    const rows = await this.exec(tx)
      .select({ id: users.id, email: users.email, handle: creatorProfiles.handle })
      .from(users)
      .leftJoin(creatorProfiles, eq(creatorProfiles.userId, users.id))
      .where(inArray(users.id, ids));
    return new Map(rows.map((r) => [r.id, r.handle ? `@${r.handle}` : r.email]));
  }

  /** Admin names per id (reviewers, approvers, case authors). */
  async adminNames(adminIds: string[], tx?: Executor): Promise<Map<string, string>> {
    const ids = [...new Set(adminIds)].filter(Boolean);
    if (!ids.length) return new Map();
    const rows = await this.exec(tx).select({ id: admins.id, name: admins.name }).from(admins).where(inArray(admins.id, ids));
    return new Map(rows.map((r) => [r.id, r.name]));
  }

  /** Creators by handle prefix, exact email or exact user id. */
  async searchCreators(term: string, limit = 50, tx?: Executor, cursor?: Cursor | null) {
    const t = term.trim().toLowerCase();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(t);
    const conditions: SQL[] = [eq(users.email, t), ilike(creatorProfiles.handleLower, `${t.replace(/[%_\\]/g, "")}%`)];
    if (isUuid) conditions.push(eq(users.id, t));
    return this.exec(tx)
      .select({
        id: users.id,
        userId: users.id,
        email: users.email,
        name: users.name,
        status: users.status,
        handle: creatorProfiles.handle,
        profileStatus: creatorProfiles.status,
        riskTier: creatorProfiles.riskTier,
        createdAt: users.createdAt,
      })
      .from(users)
      .leftJoin(creatorProfiles, eq(creatorProfiles.userId, users.id))
      .where(and(t ? or(...conditions) : undefined, olderThan(users.createdAt, users.id, cursor)))
      .orderBy(...newestFirst(users.createdAt, users.id))
      .limit(Math.min(limit, 201));
  }

  async creatorDetail(userId: string, tx?: Executor) {
    const db = this.exec(tx);
    const [row] = await db
      .select({ user: users, profile: creatorProfiles, wallet: creatorWallets })
      .from(users)
      .leftJoin(creatorProfiles, eq(creatorProfiles.userId, users.id))
      .leftJoin(creatorWallets, eq(creatorWallets.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);
    return row ?? null;
  }

  async listPayments(filter: PaymentFilter, limit = 100, tx?: Executor) {
    const where = and(
      filter.status ? eq(payments.status, filter.status) : undefined,
      filter.kind ? eq(payments.kind, filter.kind) : undefined,
      filter.creatorId ? eq(payments.creatorId, filter.creatorId) : undefined,
      filter.from ? gte(payments.createdAt, filter.from) : undefined,
      filter.to ? lt(payments.createdAt, filter.to) : undefined,
      olderThan(payments.createdAt, payments.id, filter.cursor),
    );
    return this.exec(tx)
      .select()
      .from(payments)
      .where(where)
      .orderBy(...newestFirst(payments.createdAt, payments.id))
      .limit(Math.min(limit, 201));
  }

  async listPayouts(filter: PayoutFilter, limit = 50, tx?: Executor) {
    return this.exec(tx)
      .select()
      .from(payouts)
      .where(
        and(
          filter.status ? eq(payouts.status, filter.status) : undefined,
          filter.creatorId ? eq(payouts.creatorId, filter.creatorId) : undefined,
          olderThan(payouts.createdAt, payouts.id, filter.cursor),
        ),
      )
      .orderBy(...newestFirst(payouts.createdAt, payouts.id))
      .limit(Math.min(limit, 201));
  }

  async findPayment(id: string, tx?: Executor) {
    const [row] = await this.exec(tx).select().from(payments).where(eq(payments.id, id)).limit(1);
    return row ?? null;
  }

  async paymentTimeline(paymentId: string, tx?: Executor) {
    const db = this.exec(tx);
    const [events, ledger] = await Promise.all([
      db.select().from(paymentEvents).where(eq(paymentEvents.paymentId, paymentId)).orderBy(paymentEvents.createdAt),
      db
        .select({ key: ledgerJournals.idempotencyKey, kind: ledgerJournals.kind, account: ledgerEntries.account, amountMinor: ledgerEntries.amountMinor, at: ledgerEntries.createdAt })
        .from(ledgerEntries)
        .innerJoin(ledgerJournals, eq(ledgerJournals.id, ledgerEntries.journalId))
        .where(eq(ledgerJournals.paymentId, paymentId))
        .orderBy(ledgerEntries.createdAt),
    ]);
    return { events, ledger };
  }

  async stuckPayouts(cutoff: Date, tx?: Executor) {
    return this.exec(tx)
      .select()
      .from(payouts)
      .where(and(inArray(payouts.status, ["requested", "processing"]), lt(payouts.updatedAt, cutoff)))
      .orderBy(payouts.requestedAt)
      .limit(100);
  }

  async webhookEvents(status: WebhookStatusFilter | undefined, limit = 100, tx?: Executor, cursor?: Cursor | null) {
    return this.exec(tx)
      .select({
        id: webhookEvents.id,
        providerEventId: webhookEvents.providerEventId,
        eventName: webhookEvents.eventName,
        status: webhookEvents.status,
        attempts: webhookEvents.attempts,
        lastError: webhookEvents.lastError,
        receivedAt: webhookEvents.receivedAt,
      })
      .from(webhookEvents)
      .where(and(status ? eq(webhookEvents.status, status) : undefined, olderThan(webhookEvents.receivedAt, webhookEvents.id, cursor)))
      .orderBy(...newestFirst(webhookEvents.receivedAt, webhookEvents.id))
      .limit(Math.min(limit, 201));
  }

  async findWebhookEvent(id: string, tx?: Executor) {
    const [row] = await this.exec(tx).select().from(webhookEvents).where(eq(webhookEvents.id, id)).limit(1);
    return row ?? null;
  }

  async auditLog(filter: AuditFilter, limit = 200, tx?: Executor) {
    return this.exec(tx)
      .select()
      .from(auditLogs)
      .where(
        and(
          filter.actorId ? eq(auditLogs.actorId, filter.actorId) : undefined,
          filter.targetType ? eq(auditLogs.targetType, filter.targetType) : undefined,
          filter.targetId ? eq(auditLogs.targetId, filter.targetId) : undefined,
          filter.action ? ilike(auditLogs.action, `${filter.action.replace(/[%_\\]/g, "")}%`) : undefined,
          filter.from ? gte(auditLogs.createdAt, filter.from) : undefined,
          filter.to ? lt(auditLogs.createdAt, filter.to) : undefined,
          olderThan(auditLogs.createdAt, auditLogs.id, filter.cursor),
        ),
      )
      .orderBy(...newestFirst(auditLogs.createdAt, auditLogs.id))
      .limit(Math.min(limit, 5000));
  }

  /** Every saved version of one setting, newest first. */
  async settingsHistory(key: string, limit = 20, tx?: Executor) {
    return this.exec(tx)
      .select()
      .from(platformSettingsHistory)
      .where(eq(platformSettingsHistory.key, key))
      .orderBy(desc(platformSettingsHistory.version))
      .limit(Math.min(limit, 100));
  }
}
