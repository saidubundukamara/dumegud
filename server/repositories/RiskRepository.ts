import "server-only";
import { and, desc, eq, gt, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import {
  accountRestrictions,
  authEvents,
  contentReports,
  moderationActions,
  payments,
  payoutMethods,
  payouts,
  riskAlerts,
  riskCases,
  riskRules,
  transactionLimits,
  type LimitScope,
  type RestrictionFeature,
  type RiskAlert,
  type RiskCase,
} from "@/server/db/schema";
import { BaseRepository } from "./BaseRepository";

const COUNTED: ("pending" | "succeeded" | "under_review")[] = ["pending", "succeeded", "under_review"];
const SETTLED: ("succeeded" | "under_review")[] = ["succeeded", "under_review"];
const num = (v: unknown) => Number(v ?? 0);

/**
 * Risk data access: limit/rule configuration, alerts, cases, restrictions, reports, and the
 * windowed SUM/COUNT queries limits and rules are evaluated with (indexed on payments).
 */
export class RiskRepository extends BaseRepository {
  // ── Limits & rules ────────────────────────────────────────────────────────────

  async activeLimits(scopes: LimitScope[], tx?: Executor) {
    return this.exec(tx)
      .select()
      .from(transactionLimits)
      .where(and(eq(transactionLimits.active, true), inArray(transactionLimits.scope, scopes)));
  }

  async allLimits(tx?: Executor) {
    return this.exec(tx).select().from(transactionLimits).orderBy(transactionLimits.scope, transactionLimits.window);
  }

  async findLimit(id: string, tx?: Executor) {
    const [row] = await this.exec(tx).select().from(transactionLimits).where(eq(transactionLimits.id, id)).limit(1);
    return row ?? null;
  }

  async insertLimit(data: typeof transactionLimits.$inferInsert, tx?: Executor) {
    const [row] = await this.exec(tx).insert(transactionLimits).values(data).returning();
    return row;
  }

  async updateLimit(id: string, patch: Partial<typeof transactionLimits.$inferInsert>, tx?: Executor) {
    const [row] = await this.exec(tx).update(transactionLimits).set(patch).where(eq(transactionLimits.id, id)).returning();
    return row ?? null;
  }

  async allRules(tx?: Executor) {
    return this.exec(tx).select().from(riskRules).orderBy(riskRules.code);
  }

  async updateRule(code: string, patch: Partial<typeof riskRules.$inferInsert>, tx?: Executor) {
    const [row] = await this.exec(tx).update(riskRules).set({ ...patch, updatedAt: new Date() }).where(eq(riskRules.code, code)).returning();
    return row ?? null;
  }

  async activeRules(tx?: Executor) {
    return this.exec(tx).select().from(riskRules).where(eq(riskRules.active, true));
  }

  // ── Window statistics ─────────────────────────────────────────────────────────

  /** Money committed to a creator since `since` (open + settled), for receipt limits. */
  async creatorReceipts(creatorId: string, since: Date, tx?: Executor): Promise<number> {
    const [row] = await this.exec(tx)
      .select({ v: sql<string>`coalesce(sum(${payments.grossMinor}), 0)` })
      .from(payments)
      .where(and(eq(payments.creatorId, creatorId), inArray(payments.status, COUNTED), gte(payments.createdAt, since)));
    return num(row?.v);
  }

  async checkoutsFromIp(ipHash: string, since: Date, tx?: Executor): Promise<number> {
    const [row] = await this.exec(tx)
      .select({ v: sql<string>`count(*)` })
      .from(payments)
      .where(and(eq(payments.ipHash, ipHash), gte(payments.createdAt, since)));
    return num(row?.v);
  }

  /** Settled money from one payer, optionally to one creator, since `since`. */
  async payerTotals(fingerprint: string, since: Date, creatorId?: string, tx?: Executor) {
    const [row] = await this.exec(tx)
      .select({ sum: sql<string>`coalesce(sum(${payments.grossMinor}), 0)`, count: sql<string>`count(*)` })
      .from(payments)
      .where(
        and(
          eq(payments.payerFingerprintHash, fingerprint),
          inArray(payments.status, SETTLED),
          gte(payments.settledAt, since),
          creatorId ? eq(payments.creatorId, creatorId) : undefined,
        ),
      );
    return { sumMinor: num(row?.sum), count: num(row?.count) };
  }

  async creatorSettledTotal(creatorId: string, since: Date, tx?: Executor): Promise<number> {
    const [row] = await this.exec(tx)
      .select({ v: sql<string>`coalesce(sum(${payments.grossMinor}), 0)` })
      .from(payments)
      .where(and(eq(payments.creatorId, creatorId), inArray(payments.status, SETTLED), gte(payments.settledAt, since)));
    return num(row?.v);
  }

  async nearThresholdCount(creatorId: string, since: Date, low: number, high: number, tx?: Executor): Promise<number> {
    const [row] = await this.exec(tx)
      .select({ v: sql<string>`count(*)` })
      .from(payments)
      .where(
        and(
          eq(payments.creatorId, creatorId),
          inArray(payments.status, COUNTED),
          gte(payments.createdAt, since),
          gte(payments.grossMinor, low),
          lte(payments.grossMinor, high),
        ),
      );
    return num(row?.v);
  }

  async unpaidCount(creatorId: string, since: Date, tx?: Executor): Promise<number> {
    const [row] = await this.exec(tx)
      .select({ v: sql<string>`count(*)` })
      .from(payments)
      .where(and(eq(payments.creatorId, creatorId), inArray(payments.status, ["failed", "canceled", "expired"]), gte(payments.createdAt, since)));
    return num(row?.v);
  }

  async payoutTotal(creatorId: string, since: Date, tx?: Executor): Promise<number> {
    const [row] = await this.exec(tx)
      .select({ v: sql<string>`coalesce(sum(${payouts.amountMinor}), 0)` })
      .from(payouts)
      .where(and(eq(payouts.creatorId, creatorId), inArray(payouts.status, ["requested", "in_review", "processing", "completed"]), gte(payouts.requestedAt, since)));
    return num(row?.v);
  }

  async payoutMethodCount(userId: string, since: Date, tx?: Executor): Promise<number> {
    const [row] = await this.exec(tx)
      .select({ v: sql<string>`count(*)` })
      .from(payoutMethods)
      .where(and(eq(payoutMethods.userId, userId), gte(payoutMethods.boundAt, since)));
    return num(row?.v);
  }

  /** Has the creator signed in from this (hashed) network recently? */
  async creatorUsedIp(creatorId: string, ipHash: string, since: Date, tx?: Executor): Promise<boolean> {
    const [row] = await this.exec(tx)
      .select({ id: authEvents.id })
      .from(authEvents)
      .where(and(eq(authEvents.userId, creatorId), eq(authEvents.ipHash, ipHash), gte(authEvents.createdAt, since)))
      .limit(1);
    return Boolean(row);
  }

  // ── Alerts ────────────────────────────────────────────────────────────────────

  async recentOpenAlert(ruleCode: string, subjectId: string, since: Date, tx?: Executor) {
    const [row] = await this.exec(tx)
      .select({ id: riskAlerts.id })
      .from(riskAlerts)
      .where(and(eq(riskAlerts.ruleCode, ruleCode), eq(riskAlerts.subjectId, subjectId), eq(riskAlerts.status, "open"), gte(riskAlerts.createdAt, since)))
      .limit(1);
    return row ?? null;
  }

  async insertAlert(data: typeof riskAlerts.$inferInsert, tx?: Executor): Promise<RiskAlert> {
    const [row] = await this.exec(tx).insert(riskAlerts).values(data).returning();
    return row;
  }

  async listAlerts(status: RiskAlert["status"], limit = 100, tx?: Executor) {
    return this.exec(tx).select().from(riskAlerts).where(eq(riskAlerts.status, status)).orderBy(desc(riskAlerts.createdAt)).limit(limit);
  }

  async findAlerts(ids: string[], tx?: Executor) {
    if (!ids.length) return [];
    return this.exec(tx).select().from(riskAlerts).where(inArray(riskAlerts.id, ids));
  }

  async updateAlerts(ids: string[], patch: Partial<RiskAlert>, tx?: Executor) {
    if (!ids.length) return;
    await this.exec(tx).update(riskAlerts).set(patch).where(inArray(riskAlerts.id, ids));
  }

  async countOpenHighAlerts(creatorId: string, since: Date, tx?: Executor): Promise<number> {
    const [row] = await this.exec(tx)
      .select({ v: sql<string>`count(*)` })
      .from(riskAlerts)
      .where(and(eq(riskAlerts.creatorId, creatorId), eq(riskAlerts.severity, "high"), gte(riskAlerts.createdAt, since)));
    return num(row?.v);
  }

  // ── Cases ─────────────────────────────────────────────────────────────────────

  async insertCase(data: typeof riskCases.$inferInsert, tx?: Executor): Promise<RiskCase> {
    const [row] = await this.exec(tx).insert(riskCases).values(data).returning();
    return row;
  }

  async lockCase(id: string, tx: Executor): Promise<RiskCase | null> {
    const [row] = await tx.select().from(riskCases).where(eq(riskCases.id, id)).for("update").limit(1);
    return row ?? null;
  }

  async findCase(id: string, tx?: Executor): Promise<RiskCase | null> {
    const [row] = await this.exec(tx).select().from(riskCases).where(eq(riskCases.id, id)).limit(1);
    return row ?? null;
  }

  async updateCase(id: string, patch: Partial<RiskCase>, tx?: Executor) {
    const [row] = await this.exec(tx).update(riskCases).set(patch).where(eq(riskCases.id, id)).returning();
    return row ?? null;
  }

  async listCases(limit = 100, tx?: Executor) {
    return this.exec(tx).select().from(riskCases).where(ne(riskCases.status, "closed")).orderBy(desc(riskCases.updatedAt)).limit(limit);
  }

  // ── Restrictions ──────────────────────────────────────────────────────────────

  async activeRestrictions(userId: string, now: Date, features?: RestrictionFeature[], tx?: Executor) {
    return this.exec(tx)
      .select()
      .from(accountRestrictions)
      .where(
        and(
          eq(accountRestrictions.userId, userId),
          isNull(accountRestrictions.liftedAt),
          or(isNull(accountRestrictions.expiresAt), gt(accountRestrictions.expiresAt, now)),
          features ? inArray(accountRestrictions.feature, features) : undefined,
        ),
      );
  }

  async insertRestriction(data: typeof accountRestrictions.$inferInsert, tx?: Executor) {
    const [row] = await this.exec(tx).insert(accountRestrictions).values(data).returning();
    return row;
  }

  async liftRestrictions(userId: string, by: string, now: Date, tx?: Executor) {
    return this.exec(tx)
      .update(accountRestrictions)
      .set({ liftedAt: now, liftedBy: by })
      .where(and(eq(accountRestrictions.userId, userId), isNull(accountRestrictions.liftedAt)))
      .returning({ id: accountRestrictions.id });
  }

  // ── Reports & moderation ──────────────────────────────────────────────────────

  async insertReport(data: typeof contentReports.$inferInsert, tx?: Executor) {
    const [row] = await this.exec(tx).insert(contentReports).values(data).returning();
    return row;
  }

  async listReports(status: "open" | "dismissed" | "actioned", limit = 100, tx?: Executor) {
    return this.exec(tx).select().from(contentReports).where(eq(contentReports.status, status)).orderBy(desc(contentReports.createdAt)).limit(limit);
  }

  async resolveReport(id: string, status: "dismissed" | "actioned", by: string, now: Date, tx?: Executor) {
    const [row] = await this.exec(tx)
      .update(contentReports)
      .set({ status, resolvedBy: by, resolvedAt: now })
      .where(and(eq(contentReports.id, id), eq(contentReports.status, "open")))
      .returning();
    return row ?? null;
  }

  async insertModerationAction(data: typeof moderationActions.$inferInsert, tx?: Executor) {
    await this.exec(tx).insert(moderationActions).values(data);
  }
}
