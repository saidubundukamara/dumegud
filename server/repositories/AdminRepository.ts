import "server-only";
import { and, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import {
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
  riskAlerts,
  users,
  webhookEvents,
  type PaymentStatus,
} from "@/server/db/schema";
import { BaseRepository } from "./BaseRepository";

const n = (v: unknown) => Number(v ?? 0);

/** Read models for the admin dashboard. Bounded queries only (limits ≤ 200). */
export class AdminRepository extends BaseRepository {
  async overview(since: Date, tx?: Executor) {
    const db = this.exec(tx);
    const count = async (q: Promise<{ v: string }[]>) => n((await q)[0]?.v);
    const [registrations, published, gtv, revenue, pendingTransfers, payoutsInReview, openAlerts, openReports, failedWebhooks, pendingKyc, openDriftAlerts] =
      await Promise.all([
        count(db.select({ v: sql<string>`count(*)` }).from(users).where(gte(users.createdAt, since))),
        count(db.select({ v: sql<string>`count(*)` }).from(creatorProfiles).where(eq(creatorProfiles.status, "published"))),
        count(db.select({ v: sql<string>`coalesce(sum(${payments.grossMinor}), 0)` }).from(payments).where(and(eq(payments.status, "succeeded"), gte(payments.settledAt, since)))),
        count(db.select({ v: sql<string>`coalesce(sum(${payments.platformFeeMinor}), 0)` }).from(payments).where(and(eq(payments.status, "succeeded"), gte(payments.settledAt, since)))),
        count(db.select({ v: sql<string>`count(*)` }).from(payments).where(and(eq(payments.status, "succeeded"), eq(payments.settlementFrozen, false)))),
        count(db.select({ v: sql<string>`count(*)` }).from(payouts).where(eq(payouts.status, "in_review"))),
        count(db.select({ v: sql<string>`count(*)` }).from(riskAlerts).where(eq(riskAlerts.status, "open"))),
        count(db.select({ v: sql<string>`count(*)` }).from(contentReports).where(eq(contentReports.status, "open"))),
        count(db.select({ v: sql<string>`count(*)` }).from(webhookEvents).where(inArray(webhookEvents.status, ["failed", "dead"]))),
        count(db.select({ v: sql<string>`count(*)` }).from(kycSubmissions).where(eq(kycSubmissions.status, "pending"))),
        count(db.select({ v: sql<string>`count(*)` }).from(riskAlerts).where(and(eq(riskAlerts.status, "open"), eq(riskAlerts.ruleCode, "LEDGER_DRIFT")))),
      ]);
    return { registrations, published, gtvMinor: gtv, revenueMinor: revenue, pendingTransfers, payoutsInReview, openAlerts, openReports, failedWebhooks, pendingKyc, openDriftAlerts };
  }

  /** Creators by handle prefix, exact email or exact user id. */
  async searchCreators(term: string, limit = 50, tx?: Executor) {
    const t = term.trim().toLowerCase();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(t);
    const conditions: SQL[] = [eq(users.email, t), ilike(creatorProfiles.handleLower, `${t.replace(/[%_\\]/g, "")}%`)];
    if (isUuid) conditions.push(eq(users.id, t));
    return this.exec(tx)
      .select({
        userId: users.id,
        email: users.email,
        name: users.name,
        status: users.status,
        role: users.role,
        handle: creatorProfiles.handle,
        profileStatus: creatorProfiles.status,
        riskTier: creatorProfiles.riskTier,
        createdAt: users.createdAt,
      })
      .from(users)
      .leftJoin(creatorProfiles, eq(creatorProfiles.userId, users.id))
      .where(t ? or(...conditions) : undefined)
      .orderBy(desc(users.createdAt))
      .limit(Math.min(limit, 200));
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

  async listPayments(filter: { status?: PaymentStatus; kind?: "contribution" | "order"; creatorId?: string; from?: Date; to?: Date }, limit = 100, tx?: Executor) {
    const where = and(
      filter.status ? eq(payments.status, filter.status) : undefined,
      filter.kind ? eq(payments.kind, filter.kind) : undefined,
      filter.creatorId ? eq(payments.creatorId, filter.creatorId) : undefined,
      filter.from ? gte(payments.createdAt, filter.from) : undefined,
      filter.to ? lt(payments.createdAt, filter.to) : undefined,
    );
    return this.exec(tx).select().from(payments).where(where).orderBy(desc(payments.createdAt)).limit(Math.min(limit, 200));
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

  async stuckPayouts(olderThan: Date, tx?: Executor) {
    return this.exec(tx)
      .select()
      .from(payouts)
      .where(and(inArray(payouts.status, ["requested", "processing"]), lt(payouts.updatedAt, olderThan)))
      .orderBy(payouts.requestedAt)
      .limit(100);
  }

  async webhookEvents(status: "failed" | "dead" | "ignored" | "processed" | "processing" | undefined, limit = 100, tx?: Executor) {
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
      .where(status ? eq(webhookEvents.status, status) : undefined)
      .orderBy(desc(webhookEvents.receivedAt))
      .limit(Math.min(limit, 200));
  }

  async findWebhookEvent(id: string, tx?: Executor) {
    const [row] = await this.exec(tx).select().from(webhookEvents).where(eq(webhookEvents.id, id)).limit(1);
    return row ?? null;
  }

  async auditLog(filter: { actorId?: string; targetType?: string; targetId?: string; action?: string; from?: Date; to?: Date }, limit = 200, tx?: Executor) {
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
        ),
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(Math.min(limit, 5000));
  }
}
