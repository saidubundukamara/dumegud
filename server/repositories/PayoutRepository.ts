import "server-only";
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { payouts, type Payout, type PayoutStatus } from "@/server/db/schema";
import { BaseRepository } from "./BaseRepository";

export class PayoutRepository extends BaseRepository {
  /** Throws a unique violation when the creator already has an open payout. */
  async insert(data: typeof payouts.$inferInsert, tx?: Executor): Promise<Payout> {
    const [row] = await this.exec(tx).insert(payouts).values(data).returning();
    return row;
  }

  async findById(id: string, tx?: Executor): Promise<Payout | null> {
    const [row] = await this.exec(tx).select().from(payouts).where(eq(payouts.id, id)).limit(1);
    return row ?? null;
  }

  async lockById(id: string, tx: Executor): Promise<Payout | null> {
    const [row] = await tx.select().from(payouts).where(eq(payouts.id, id)).for("update").limit(1);
    return row ?? null;
  }

  async lockByMonimeId(monimePayoutId: string, tx: Executor): Promise<Payout | null> {
    const [row] = await tx.select().from(payouts).where(eq(payouts.monimePayoutId, monimePayoutId)).for("update").limit(1);
    return row ?? null;
  }

  /**
   * Take the right to send this `requested` payout to Monime: only one caller wins. The claim is a
   * lease kept in `updated_at` (pushed 2 minutes ahead), so a concurrent dispatch, the reconcile
   * cron and a staff redispatch skip it; any later write resets `updated_at` and ends the lease.
   * The 5 s slack tolerates app/database clock skew on rows the app last touched.
   */
  async claimDispatch(id: string, tx?: Executor): Promise<Payout | null> {
    const [row] = await this.exec(tx)
      .update(payouts)
      .set({ updatedAt: sql`now() + interval '2 minutes'` })
      .where(and(eq(payouts.id, id), eq(payouts.status, "requested"), sql`${payouts.updatedAt} <= now() + interval '5 seconds'`))
      .returning();
    return row ?? null;
  }

  /** Guarded status change: returns null if the payout isn't in one of `from`. */
  async transition(id: string, from: readonly PayoutStatus[], to: PayoutStatus, patch: Partial<Payout> = {}, tx?: Executor) {
    const [row] = await this.exec(tx)
      .update(payouts)
      .set({ ...patch, status: to })
      .where(and(eq(payouts.id, id), inArray(payouts.status, [...from])))
      .returning();
    return row ?? null;
  }

  async update(id: string, patch: Partial<Payout>, tx?: Executor): Promise<Payout | null> {
    const [row] = await this.exec(tx).update(payouts).set(patch).where(eq(payouts.id, id)).returning();
    return row ?? null;
  }

  async findOpenForCreator(creatorId: string, tx?: Executor): Promise<Payout | null> {
    const [row] = await this.exec(tx)
      .select()
      .from(payouts)
      .where(and(eq(payouts.creatorId, creatorId), inArray(payouts.status, ["requested", "in_review", "processing"])))
      .limit(1);
    return row ?? null;
  }

  async listForCreator(creatorId: string, limit = 20, tx?: Executor): Promise<Payout[]> {
    return this.exec(tx).select().from(payouts).where(eq(payouts.creatorId, creatorId)).orderBy(desc(payouts.requestedAt)).limit(Math.min(limit, 100));
  }

  /** reconcile-payouts cron: payouts sent (or being sent) to Monime with no outcome yet. */
  async listStale(olderThan: Date, limit: number, tx?: Executor): Promise<Payout[]> {
    return this.exec(tx)
      .select()
      .from(payouts)
      .where(and(inArray(payouts.status, ["requested", "processing"]), lt(payouts.updatedAt, olderThan)))
      .orderBy(asc(payouts.updatedAt))
      .limit(limit);
  }

  async listByStatus(status: PayoutStatus, limit = 50, tx?: Executor): Promise<Payout[]> {
    return this.exec(tx).select().from(payouts).where(eq(payouts.status, status)).orderBy(asc(payouts.requestedAt)).limit(limit);
  }
}
