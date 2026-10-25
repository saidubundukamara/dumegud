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
  users,
  type LimitScope,
  type RestrictionFeature,
  type RiskAlert,
  type RiskCase,
} from "@/server/db/schema";
import type { Cursor } from "@/server/lib/cursor";
import { BaseRepository } from "./BaseRepository";
import { newestFirst, olderThan } from "./keyset";

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

  async lockLimit(id: string, tx: Executor) {
    const [row] = await tx.select().from(transactionLimits).where(eq(transactionLimits.id, id)).for("update").limit(1);
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

  /** Row-locks a rule, for an accurate audit `before` (any rule, active or not). */
  async lockRule(code: string, tx: Executor) {
    const [row] = await tx.select().from(riskRules).where(eq(riskRules.code, code)).for("update").limit(1);
    return row ?? null;
  }

  async updateRule(code: string, patch: Partial<typeof riskRules.$inferInsert>, tx?: Executor) {
    const [row] = await this.exec(tx).update(riskRules).set({ ...patch, updatedAt: new Date() }).where(eq(riskRules.code, code)).returning();
    return row ?? null;
  }

  async activeRules(tx?: Executor) {
    return this.exec(tx).select().from(riskRules).where(eq(riskRules.active, true));
  }

  // ── Window statistics ─────────────────────────────────────────────────────────

  /** Transaction-scoped advisory lock on a payer fingerprint (released at commit; pool-safe). */
  async lockPayer(fingerprint: string, tx: Executor): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"payer:" + fingerprint}))`);
  }

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

  async listAlerts(status: RiskAlert["status"], limit = 100, tx?: Executor, cursor?: Cursor | null) {
    return this.exec(tx)
      .select()
      .from(riskAlerts)
      .where(and(eq(riskAlerts.status, status), olderThan(riskAlerts.createdAt, riskAlerts.id, cursor)))
      .orderBy(...newestFirst(riskAlerts.createdAt, riskAlerts.id))
      .limit(limit);
  }

  /** Alerts grouped into a case, or every alert about one creator. */
  async alertsFor(by: { caseId: string } | { creatorId: string }, limit = 50, tx?: Executor) {
    return this.exec(tx)
      .select()
      .from(riskAlerts)
      .where("caseId" in by ? eq(riskAlerts.caseId, by.caseId) : eq(riskAlerts.creatorId, by.creatorId))
      .orderBy(desc(riskAlerts.createdAt))
      .limit(limit);
  }

  async findAlerts(ids: string[], tx?: Executor) {
    if (!ids.length) return [];
    return this.exec(tx).select().from(riskAlerts).where(inArray(riskAlerts.id, ids));
  }

  async updateAlerts(ids: string[], patch: Partial<RiskAlert>, tx?: Executor) {
    if (!ids.length) return;
    await this.exec(tx).update(riskAlerts).set(patch).where(inArray(riskAlerts.id, ids));
  }

  /**
   * Attach open, unassigned alerts to a case. Returns the ids actually taken: an alert another
   * case claimed, or one dismissed, in the meantime is left alone.
   */
  async claimAlertsForCase(ids: string[], caseId: string, creatorId: string, tx?: Executor): Promise<string[]> {
    if (!ids.length) return [];
    const rows = await this.exec(tx)
      .update(riskAlerts)
      .set({ status: "escalated", caseId })
      .where(and(inArray(riskAlerts.id, ids), eq(riskAlerts.creatorId, creatorId), eq(riskAlerts.status, "open"), isNull(riskAlerts.caseId)))
      .returning({ id: riskAlerts.id });
    return rows.map((r) => r.id);
  }

  /** Only an alert still open: never overwrites one escalated into a case or already actioned. */
  async dismissOpenAlert(id: string, tx?: Executor): Promise<boolean> {
    const rows = await this.exec(tx)
      .update(riskAlerts)
      .set({ status: "dismissed" })
      .where(and(eq(riskAlerts.id, id), eq(riskAlerts.status, "open")))
      .returning({ id: riskAlerts.id });
    return rows.length > 0;
  }

  /** Close every alert still escalated into this case. */
  async closeCaseAlerts(caseId: string, status: "dismissed" | "actioned", tx?: Executor): Promise<void> {
    await this.exec(tx)
      .update(riskAlerts)
      .set({ status })
      .where(and(eq(riskAlerts.caseId, caseId), eq(riskAlerts.status, "escalated")));
  }

  async countOpenHighAlerts(creatorId: string, since: Date, tx?: Executor): Promise<number> {
    const [row] = await this.exec(tx)
      .select({ v: sql<string>`count(*)` })
      .from(riskAlerts)
      .where(and(eq(riskAlerts.creatorId, creatorId), eq(riskAlerts.severity, "high"), gte(riskAlerts.createdAt, since)));
    return num(row?.v);
  }

  // ── Cases ─────────────────────────────────────────────────────────────────────

  /** Row-locks the creator's user row (serialises case opening per creator). False if there's no such user. */
  async lockCreator(creatorId: string, tx: Executor): Promise<boolean> {
    const [row] = await tx.select({ id: users.id }).from(users).where(eq(users.id, creatorId)).for("update").limit(1);
    return Boolean(row);
  }

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

  /** Atomic append, so two staff adding notes at once both keep theirs. */
  async appendCaseNote(id: string, note: { by: string; at: string; text: string }, tx?: Executor): Promise<boolean> {
    const rows = await this.exec(tx)
      .update(riskCases)
      .set({ notes: sql`coalesce(${riskCases.notes}, '[]'::jsonb) || ${JSON.stringify([note])}::jsonb`, updatedAt: new Date() })
      .where(eq(riskCases.id, id))
      .returning({ id: riskCases.id });
    return rows.length > 0;
  }

  async updateCase(id: string, patch: Partial<RiskCase>, tx?: Executor) {
    const [row] = await this.exec(tx).update(riskCases).set(patch).where(eq(riskCases.id, id)).returning();
    return row ?? null;
  }

  async listCases(limit = 100, tx?: Executor) {
    return this.exec(tx).select().from(riskCases).where(ne(riskCases.status, "closed")).orderBy(desc(riskCases.updatedAt)).limit(limit);
  }

  /** Closed cases, newest first (the history tab). */
  async listClosedCases(limit = 50, tx?: Executor, cursor?: Cursor | null) {
    return this.exec(tx)
      .select()
      .from(riskCases)
      .where(and(eq(riskCases.status, "closed"), olderThan(riskCases.createdAt, riskCases.id, cursor)))
      .orderBy(...newestFirst(riskCases.createdAt, riskCases.id))
      .limit(limit);
  }

  async casesForCreator(creatorId: string, limit = 20, tx?: Executor) {
    return this.exec(tx).select().from(riskCases).where(eq(riskCases.creatorId, creatorId)).orderBy(desc(riskCases.createdAt)).limit(limit);
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

  async listReports(status: "open" | "dismissed" | "actioned", limit = 100, tx?: Executor, cursor?: Cursor | null) {
    return this.exec(tx)
      .select()
      .from(contentReports)
      .where(and(eq(contentReports.status, status), olderThan(contentReports.createdAt, contentReports.id, cursor)))
      .orderBy(...newestFirst(contentReports.createdAt, contentReports.id))
      .limit(limit);
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

  /** Any case about this creator that staff haven't closed yet. */
  async openCaseForCreator(creatorId: string, tx?: Executor): Promise<RiskCase | null> {
    const [row] = await this.exec(tx)
      .select()
      .from(riskCases)
      .where(and(eq(riskCases.creatorId, creatorId), ne(riskCases.status, "closed")))
      .limit(1);
    return row ?? null;
  }

}
