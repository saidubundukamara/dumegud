import "server-only";
import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import {
  contributions,
  paymentEvents,
  payments,
  type Contribution,
  type Payment,
  type PaymentEventSource,
  type PaymentStatus,
} from "@/server/db/schema";
import { BaseRepository } from "./BaseRepository";

export type NewPayment = typeof payments.$inferInsert;
export type NewContribution = Omit<typeof contributions.$inferInsert, "paymentId" | "creatorId">;
export type PaymentPatch = Partial<Omit<Payment, "id" | "kind" | "creatorId" | "grossMinor" | "createdAt" | "status">>;
export type EventInfo = { source: PaymentEventSource; providerEventId?: string | null; detail?: Record<string, unknown> };

export type ContributionRow = { payment: Payment; contribution: Contribution };

export class PaymentRepository extends BaseRepository {
  /** A new payment plus its creation event. */
  async insertPayment(payment: NewPayment, tx?: Executor): Promise<Payment> {
    const db = this.exec(tx);
    const [row] = await db.insert(payments).values(payment).returning();
    await db.insert(paymentEvents).values({ paymentId: row.id, fromStatus: null, toStatus: row.status, source: "app" });
    return row;
  }

  async insertContribution(payment: NewPayment, contribution: NewContribution, tx?: Executor): Promise<Payment> {
    const row = await this.insertPayment(payment, tx);
    await this.exec(tx).insert(contributions).values({ ...contribution, paymentId: row.id, creatorId: row.creatorId });
    return row;
  }

  async findById(id: string, tx?: Executor): Promise<Payment | null> {
    const [row] = await this.exec(tx).select().from(payments).where(eq(payments.id, id)).limit(1);
    return row ?? null;
  }

  /** Row-locks the payment for the rest of the transaction (serialises concurrent webhooks). */
  async lockById(id: string, tx: Executor): Promise<Payment | null> {
    const [row] = await tx.select().from(payments).where(eq(payments.id, id)).for("update").limit(1);
    return row ?? null;
  }

  async lockBySessionId(sessionId: string, tx: Executor): Promise<Payment | null> {
    const [row] = await tx
      .select()
      .from(payments)
      .where(eq(payments.monimeCheckoutSessionId, sessionId))
      .for("update")
      .limit(1);
    return row ?? null;
  }

  /**
   * Guarded status change + audit event. Returns null (and writes nothing) when the payment is
   * not currently in one of `from`: callers treat that as "already moved on".
   */
  async transition(
    id: string,
    from: readonly PaymentStatus[],
    to: PaymentStatus,
    event: EventInfo,
    patch: PaymentPatch = {},
    tx?: Executor,
  ): Promise<Payment | null> {
    if (!from.length) return null;
    const db = this.exec(tx);
    const [before] = await db.select({ status: payments.status }).from(payments).where(eq(payments.id, id)).limit(1);
    const [row] = await db
      .update(payments)
      .set({ ...patch, status: to })
      .where(and(eq(payments.id, id), inArray(payments.status, [...from])))
      .returning();
    if (!row) return null;
    await db.insert(paymentEvents).values({
      paymentId: id,
      fromStatus: before?.status ?? null,
      toStatus: to,
      source: event.source,
      providerEventId: event.providerEventId ?? null,
      detail: event.detail ?? null,
    });
    return row;
  }

  /** Unguarded field update (references, split, transfer bookkeeping). Never changes status. */
  async update(id: string, patch: PaymentPatch, tx?: Executor): Promise<Payment | null> {
    const [row] = await this.exec(tx).update(payments).set(patch).where(eq(payments.id, id)).returning();
    return row ?? null;
  }

  /**
   * Take the transfer for this payment: only one caller wins (none|failed → pending), and only
   * for a succeeded payment with a computed split that hasn't been frozen.
   */
  async claimTransfer(id: string, tx?: Executor): Promise<Payment | null> {
    const [row] = await this.exec(tx)
      .update(payments)
      .set({ transferStatus: "pending" })
      .where(
        and(
          eq(payments.id, id),
          eq(payments.status, "succeeded"),
          isNotNull(payments.creatorNetMinor),
          eq(payments.settlementFrozen, false),
          inArray(payments.transferStatus, ["none", "failed"]),
        ),
      )
      .returning();
    return row ?? null;
  }

  /** A checkout for the same supporter/creator/amount started moments ago (retry storms, double taps). */
  async findRecentOpenCheckout(ipHash: string, creatorId: string, grossMinor: number, since: Date, tx?: Executor) {
    const [row] = await this.exec(tx)
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.ipHash, ipHash),
          eq(payments.creatorId, creatorId),
          eq(payments.grossMinor, grossMinor),
          eq(payments.status, "pending"),
          isNotNull(payments.checkoutUrl),
          gte(payments.createdAt, since),
        ),
      )
      .orderBy(desc(payments.createdAt))
      .limit(1);
    return row ?? null;
  }

  /** Owner-scoped contribution list (the creatorId filter is the IDOR guard). */
  async listContributions(creatorId: string, statuses: PaymentStatus[], limit: number, tx?: Executor): Promise<ContributionRow[]> {
    return this.exec(tx)
      .select({ payment: payments, contribution: contributions })
      .from(payments)
      .innerJoin(contributions, eq(contributions.paymentId, payments.id))
      .where(and(eq(payments.creatorId, creatorId), inArray(payments.status, statuses)))
      .orderBy(desc(payments.createdAt))
      .limit(Math.min(limit, 100));
  }

  /** Names for the public "recent supporters" list: succeeded and not anonymous only. */
  async recentPublicSupporters(creatorId: string, limit: number, tx?: Executor) {
    return this.exec(tx)
      .select({ name: contributions.supporterName, at: payments.settledAt })
      .from(payments)
      .innerJoin(contributions, eq(contributions.paymentId, payments.id))
      .where(
        and(
          eq(payments.creatorId, creatorId),
          eq(payments.status, "succeeded"),
          eq(contributions.isAnonymous, false),
          isNotNull(contributions.supporterName),
        ),
      )
      .orderBy(desc(payments.settledAt))
      .limit(Math.min(limit, 20));
  }

  /** Succeeded payments still waiting for a reported fee (for the Phase 9 estimate cron). */
  async listAwaitingFee(olderThan: Date, limit: number, tx?: Executor): Promise<Payment[]> {
    return this.exec(tx)
      .select()
      .from(payments)
      .where(and(eq(payments.status, "succeeded"), isNull(payments.monimeFeeMinor), sql`${payments.settledAt} < ${olderThan}`))
      .limit(limit);
  }

  /** Creator net of settled payments not yet moved to their wallet ("on its way"). */
  async pendingTransferTotal(creatorId: string, tx?: Executor): Promise<number> {
    const [row] = await this.exec(tx)
      .select({ total: sql<string>`coalesce(sum(${payments.creatorNetMinor}), 0)` })
      .from(payments)
      .where(and(eq(payments.creatorId, creatorId), eq(payments.status, "succeeded"), eq(payments.settlementFrozen, false)));
    return Number(row?.total ?? 0);
  }
}
