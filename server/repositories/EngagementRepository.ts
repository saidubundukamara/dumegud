import "server-only";
import { and, asc, desc, eq, gte, isNull, sql } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { creatorMilestones, creatorProfiles, creatorRecaps, users, type CreatorMilestone, type CreatorRecap } from "@/server/db/schema";
import type { MilestoneMetric } from "@/lib/milestones";
import type { MonthKey, RecapStats } from "@/lib/recap";
import type { TrafficSource } from "@/lib/traffic-source";
import { BaseRepository } from "./BaseRepository";

// Recaps and milestones. Only settled (`succeeded`) payments count. A supporter is one
// mobile-money payer; a payment without a payer fingerprint counts as its own supporter, the same
// grouping the top-supporters ranking uses.

/** Settled payments of one creator, as a raw SQL condition on `payments`. */
const settled = (creatorId: string) => sql`creator_id = ${creatorId} and status = 'succeeded' and settled_at is not null`;
const supporterIdentity = sql`coalesce(payer_fingerprint_hash, 'payment:' || id::text)`;
const inList = (values: readonly number[]) => sql.join(values.map((v) => sql`${v}`), sql`, `);

export type MonthAggregate = Omit<RecapStats, "month" | "bestMonth">;

/** Where a metric crossed a threshold: the payment that did it, and when. */
export type Crossing = { metric: MilestoneMetric; threshold: number; at: Date; paymentId: string | null };

export type RecapEmailRow = { recap: CreatorRecap; email: string; name: string | null; displayName: string; handle: string };
export type MilestoneEmailRow = { milestone: CreatorMilestone; email: string; name: string | null; displayName: string; handle: string };

const rowsOf = <T>(result: unknown): T[] => ((result as { rows?: T[] }).rows ?? (result as T[]));

export class EngagementRepository extends BaseRepository {
  // ── Aggregates ────────────────────────────────────────────────────────────────

  async monthAggregate(creatorId: string, from: Date, to: Date, tx?: Executor): Promise<MonthAggregate> {
    const inMonth = sql`${settled(creatorId)} and settled_at >= ${from} and settled_at < ${to}`;
    const [totals] = rowsOf<{
      supporters: string;
      gifts: string;
      sold: string;
      gifts_net: string;
      sales_net: string;
    }>(
      await this.exec(tx).execute(sql`
        select
          count(distinct ${supporterIdentity}) filter (where kind = 'contribution') as supporters,
          count(*) filter (where kind = 'contribution') as gifts,
          count(*) filter (where kind = 'order') as sold,
          coalesce(sum(creator_net_minor) filter (where kind = 'contribution'), 0) as gifts_net,
          coalesce(sum(creator_net_minor) filter (where kind = 'order'), 0) as sales_net
        from payments where ${inMonth}`),
    );
    // New supporters: people whose first gift ever to this creator landed in this month.
    const [fresh] = rowsOf<{ n: string }>(
      await this.exec(tx).execute(sql`
        select count(*) as n from (
          select min(settled_at) as first_at from payments
          where ${settled(creatorId)} and kind = 'contribution' and settled_at < ${to}
          group by ${supporterIdentity}
        ) s where s.first_at >= ${from}`),
    );
    const [source] = rowsOf<{ source: TrafficSource }>(
      await this.exec(tx).execute(sql`
        select traffic_source as source from payments where ${inMonth} and traffic_source is not null
        group by traffic_source order by count(*) desc, traffic_source limit 1`),
    );
    const giftsNetMinor = Number(totals?.gifts_net ?? 0);
    const salesNetMinor = Number(totals?.sales_net ?? 0);
    return {
      supporters: Number(totals?.supporters ?? 0),
      newSupporters: Number(fresh?.n ?? 0),
      gifts: Number(totals?.gifts ?? 0),
      productsSold: Number(totals?.sold ?? 0),
      giftsNetMinor,
      salesNetMinor,
      receivedNetMinor: giftsNetMinor + salesNetMinor,
      topSource: source?.source ?? null,
    };
  }

  /** The most received in any single month before `before`; null when there was no earlier month. */
  async bestMonthBefore(creatorId: string, before: Date, tx?: Executor): Promise<number | null> {
    const [row] = rowsOf<{ best: string | null }>(
      await this.exec(tx).execute(sql`
        select max(total) as best from (
          select sum(coalesce(creator_net_minor, 0)) as total from payments
          where ${settled(creatorId)} and settled_at < ${before}
          group by date_trunc('month', settled_at at time zone 'UTC')
        ) m`),
    );
    return row?.best === null || row?.best === undefined ? null : Number(row.best);
  }

  /**
   * Lifetime totals, plus the payment where each threshold was crossed. Computed from the full
   * history every time, so the answer doesn't depend on which payment (or job) asked first.
   */
  async milestoneProgress(
    creatorId: string,
    thresholds: { supporters: readonly number[]; receivedNetMinor: readonly number[]; productsSold: readonly number[] },
    tx?: Executor,
  ): Promise<{ totals: { supporters: number; receivedNetMinor: number; productsSold: number }; crossings: Crossing[] }> {
    const db = this.exec(tx);
    const [totals] = rowsOf<{ supporters: string; received: string; sold: string }>(
      await db.execute(sql`
        select
          count(distinct ${supporterIdentity}) filter (where kind = 'contribution') as supporters,
          coalesce(sum(creator_net_minor), 0) as received,
          count(*) filter (where kind = 'order') as sold
        from payments where ${settled(creatorId)}`),
    );
    const crossings: Crossing[] = [];

    if (thresholds.supporters.length) {
      const rows = rowsOf<{ rn: string; at: Date | string; payment_id: string }>(
        await db.execute(sql`
          with firsts as (
            select distinct on (${supporterIdentity}) id, settled_at from payments
            where ${settled(creatorId)} and kind = 'contribution'
            order by ${supporterIdentity}, settled_at, id
          ), ranked as (
            select id, settled_at, row_number() over (order by settled_at, id) as rn from firsts
          )
          select rn, settled_at as at, id as payment_id from ranked where rn in (${inList(thresholds.supporters)})`),
      );
      for (const r of rows) crossings.push({ metric: "supporters", threshold: Number(r.rn), at: new Date(r.at), paymentId: r.payment_id });
    }

    if (thresholds.productsSold.length) {
      const rows = rowsOf<{ rn: string; at: Date | string; payment_id: string }>(
        await db.execute(sql`
          select rn, at, payment_id from (
            select id as payment_id, settled_at as at, row_number() over (order by settled_at, id) as rn
            from payments where ${settled(creatorId)} and kind = 'order'
          ) s where rn in (${inList(thresholds.productsSold)})`),
      );
      for (const r of rows) crossings.push({ metric: "productsSold", threshold: Number(r.rn), at: new Date(r.at), paymentId: r.payment_id });
    }

    for (const threshold of thresholds.receivedNetMinor) {
      const [r] = rowsOf<{ at: Date | string; payment_id: string }>(
        await db.execute(sql`
          select at, payment_id from (
            select id as payment_id, settled_at as at, sum(creator_net_minor) over (order by settled_at, id) as running
            from payments where ${settled(creatorId)} and creator_net_minor is not null
          ) s where running >= ${threshold} order by at, payment_id limit 1`),
      );
      if (r) crossings.push({ metric: "receivedNetMinor", threshold, at: new Date(r.at), paymentId: r.payment_id });
    }

    return {
      totals: {
        supporters: Number(totals?.supporters ?? 0),
        receivedNetMinor: Number(totals?.received ?? 0),
        productsSold: Number(totals?.sold ?? 0),
      },
      crossings,
    };
  }

  // ── Recaps ────────────────────────────────────────────────────────────────────

  /** Creators with a settled payment in the month and no recap for it yet. */
  async creatorsNeedingRecap(month: MonthKey, from: Date, to: Date, limit: number, tx?: Executor): Promise<string[]> {
    const rows = rowsOf<{ creator_id: string }>(
      await this.exec(tx).execute(sql`
        select distinct p.creator_id from payments p
        join users u on u.id = p.creator_id and u.status <> 'closed'
        where p.status = 'succeeded' and p.settled_at >= ${from} and p.settled_at < ${to}
          and not exists (select 1 from creator_recaps r where r.creator_id = p.creator_id and r.month = ${month})
        order by p.creator_id limit ${limit}`),
    );
    return rows.map((r) => r.creator_id);
  }

  /** First build wins; a concurrent or repeated build gets the stored row back. */
  async insertRecap(creatorId: string, stats: RecapStats, tx?: Executor): Promise<CreatorRecap> {
    const db = this.exec(tx);
    const [row] = await db.insert(creatorRecaps).values({ creatorId, month: stats.month, stats }).onConflictDoNothing().returning();
    if (row) return row;
    return (await this.findRecap(creatorId, stats.month, tx))!;
  }

  async findRecap(creatorId: string, month: MonthKey, tx?: Executor): Promise<CreatorRecap | null> {
    const [row] = await this.exec(tx)
      .select()
      .from(creatorRecaps)
      .where(and(eq(creatorRecaps.creatorId, creatorId), eq(creatorRecaps.month, month)))
      .limit(1);
    return row ?? null;
  }

  async listRecaps(creatorId: string, limit: number, tx?: Executor): Promise<CreatorRecap[]> {
    return this.exec(tx).select().from(creatorRecaps).where(eq(creatorRecaps.creatorId, creatorId)).orderBy(desc(creatorRecaps.month)).limit(limit);
  }

  /** Recaps of the month still to email, for creators who want them. */
  async recapsToEmail(month: MonthKey, limit: number, tx?: Executor): Promise<RecapEmailRow[]> {
    return this.exec(tx)
      .select({ recap: creatorRecaps, email: users.email, name: users.name, displayName: creatorProfiles.displayName, handle: creatorProfiles.handle })
      .from(creatorRecaps)
      .innerJoin(users, eq(users.id, creatorRecaps.creatorId))
      .innerJoin(creatorProfiles, eq(creatorProfiles.userId, creatorRecaps.creatorId))
      .where(
        and(
          eq(creatorRecaps.month, month),
          isNull(creatorRecaps.emailedAt),
          eq(creatorProfiles.recapEmails, true),
          sql`${users.status} <> 'closed'`,
        ),
      )
      .orderBy(asc(creatorRecaps.id))
      .limit(limit);
  }

  /** Atomic claim: only the caller that flips emailedAt from NULL sends the email. */
  async claimRecapEmail(id: string, now: Date, tx?: Executor): Promise<boolean> {
    const rows = await this.exec(tx)
      .update(creatorRecaps)
      .set({ emailedAt: now })
      .where(and(eq(creatorRecaps.id, id), isNull(creatorRecaps.emailedAt)))
      .returning({ id: creatorRecaps.id });
    return rows.length > 0;
  }

  async releaseRecapEmail(id: string, tx?: Executor): Promise<void> {
    await this.exec(tx).update(creatorRecaps).set({ emailedAt: null }).where(eq(creatorRecaps.id, id));
  }

  /** Owner-scoped; a repeat is a no-op. */
  async markRecapSeen(creatorId: string, id: string, now: Date, tx?: Executor): Promise<void> {
    await this.exec(tx)
      .update(creatorRecaps)
      .set({ seenAt: now })
      .where(and(eq(creatorRecaps.id, id), eq(creatorRecaps.creatorId, creatorId), isNull(creatorRecaps.seenAt)));
  }

  // ── Milestones ────────────────────────────────────────────────────────────────

  /** Rows that already exist are skipped. Returns only the rows this call created. */
  async insertMilestones(values: (typeof creatorMilestones.$inferInsert)[], tx?: Executor): Promise<CreatorMilestone[]> {
    if (!values.length) return [];
    return this.exec(tx).insert(creatorMilestones).values(values).onConflictDoNothing().returning();
  }

  async listMilestones(creatorId: string, tx?: Executor): Promise<CreatorMilestone[]> {
    return this.exec(tx).select().from(creatorMilestones).where(eq(creatorMilestones.creatorId, creatorId)).orderBy(asc(creatorMilestones.achievedAt));
  }

  /** Milestones whose email failed or never went out (recent ones only), for the daily retry. */
  async milestonesToEmail(since: Date, limit: number, tx?: Executor): Promise<MilestoneEmailRow[]> {
    return this.exec(tx)
      .select({ milestone: creatorMilestones, email: users.email, name: users.name, displayName: creatorProfiles.displayName, handle: creatorProfiles.handle })
      .from(creatorMilestones)
      .innerJoin(users, eq(users.id, creatorMilestones.creatorId))
      .innerJoin(creatorProfiles, eq(creatorProfiles.userId, creatorMilestones.creatorId))
      .where(
        and(
          eq(creatorMilestones.silent, false),
          isNull(creatorMilestones.emailedAt),
          gte(creatorMilestones.createdAt, since),
          eq(creatorProfiles.milestoneEmails, true),
          sql`${users.status} <> 'closed'`,
        ),
      )
      .orderBy(asc(creatorMilestones.createdAt))
      .limit(limit);
  }

  async findMilestoneEmailRow(id: string, tx?: Executor): Promise<MilestoneEmailRow | null> {
    const [row] = await this.exec(tx)
      .select({ milestone: creatorMilestones, email: users.email, name: users.name, displayName: creatorProfiles.displayName, handle: creatorProfiles.handle })
      .from(creatorMilestones)
      .innerJoin(users, eq(users.id, creatorMilestones.creatorId))
      .innerJoin(creatorProfiles, eq(creatorProfiles.userId, creatorMilestones.creatorId))
      .where(and(eq(creatorMilestones.id, id), eq(creatorProfiles.milestoneEmails, true), sql`${users.status} <> 'closed'`))
      .limit(1);
    return row ?? null;
  }

  /** Atomic claim: only the caller that flips emailedAt from NULL sends the email. */
  async claimMilestoneEmail(id: string, now: Date, tx?: Executor): Promise<boolean> {
    const rows = await this.exec(tx)
      .update(creatorMilestones)
      .set({ emailedAt: now })
      .where(and(eq(creatorMilestones.id, id), isNull(creatorMilestones.emailedAt), eq(creatorMilestones.silent, false)))
      .returning({ id: creatorMilestones.id });
    return rows.length > 0;
  }

  async releaseMilestoneEmail(id: string, tx?: Executor): Promise<void> {
    await this.exec(tx).update(creatorMilestones).set({ emailedAt: null }).where(eq(creatorMilestones.id, id));
  }

  /** Owner-scoped; a repeat is a no-op. */
  async markMilestoneSeen(creatorId: string, id: string, now: Date, tx?: Executor): Promise<void> {
    await this.exec(tx)
      .update(creatorMilestones)
      .set({ seenAt: now })
      .where(and(eq(creatorMilestones.id, id), eq(creatorMilestones.creatorId, creatorId), isNull(creatorMilestones.seenAt)));
  }

  /**
   * Creators the daily sweep should look at: anyone paid recently (a webhook may have been lost),
   * anyone with settled payments but no milestones yet (backfill), and anyone with a profile old
   * enough for the one-year milestone they don't have.
   */
  async creatorsForSweep(recentSince: Date, yearAgo: Date, after: string | null, limit: number, tx?: Executor): Promise<{ creatorId: string; profileCreatedAt: Date }[]> {
    const rows = rowsOf<{ creator_id: string; created_at: Date | string }>(
      await this.exec(tx).execute(sql`
        select cp.user_id as creator_id, cp.created_at from creator_profiles cp
        join users u on u.id = cp.user_id and u.status <> 'closed'
        where cp.user_id > ${after ?? "00000000-0000-0000-0000-000000000000"}::uuid and (
           exists (select 1 from payments p where p.creator_id = cp.user_id and p.status = 'succeeded' and p.settled_at >= ${recentSince})
           or (
             exists (select 1 from payments p where p.creator_id = cp.user_id and p.status = 'succeeded')
             and not exists (select 1 from creator_milestones m where m.creator_id = cp.user_id)
           )
           or (cp.created_at <= ${yearAgo} and not exists (select 1 from creator_milestones m where m.creator_id = cp.user_id and m.key = 'one_year'))
        )
        order by cp.user_id limit ${limit}`),
    );
    return rows.map((r) => ({ creatorId: r.creator_id, profileCreatedAt: new Date(r.created_at) }));
  }
}
