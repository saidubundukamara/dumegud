import "server-only";
import { and, count, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { contributions, payments, shoutouts, type Contribution, type SocialPlatform } from "@/server/db/schema";
import { BaseRepository } from "./BaseRepository";

export type ShoutoutCandidate = {
  contributionId: string;
  paymentId: string;
  supporterName: string | null;
  socialPlatform: SocialPlatform | null;
  socialHandle: string | null;
  grossMinor: number;
  payerFingerprintHash: string | null;
  settledAt: Date | null;
  thankedAt: Date | null;
};

/** Contributions a creator may name in a thank-you post: paid, consenting, not anonymous. */
const eligible = (creatorId: string) =>
  and(
    eq(payments.creatorId, creatorId),
    eq(payments.status, "succeeded"),
    eq(contributions.shoutoutConsent, true),
    eq(contributions.isAnonymous, false),
  );

export class ShoutoutRepository extends BaseRepository {
  async findContributionByPaymentId(paymentId: string, tx?: Executor): Promise<Contribution | null> {
    const [row] = await this.exec(tx).select().from(contributions).where(eq(contributions.paymentId, paymentId)).limit(1);
    return row ?? null;
  }

  /** Adds a handle once: only while none is set and the supporter wasn't anonymous. */
  async setHandleOnce(
    paymentId: string,
    value: { socialPlatform: SocialPlatform; socialHandle: string; at: Date },
    tx?: Executor,
  ): Promise<Contribution | null> {
    const [row] = await this.exec(tx)
      .update(contributions)
      .set({
        socialPlatform: value.socialPlatform,
        socialHandle: value.socialHandle,
        shoutoutConsent: true,
        shoutoutConsentAt: value.at,
      })
      .where(and(eq(contributions.paymentId, paymentId), isNull(contributions.socialHandle), eq(contributions.isAnonymous, false)))
      .returning();
    return row ?? null;
  }

  /** Owner-scoped (the creatorId filter is the IDOR guard). Oldest first, as people gave. */
  async listCandidates(creatorId: string, opts: { since: Date; onlyUnthanked: boolean }, tx?: Executor): Promise<ShoutoutCandidate[]> {
    return this.exec(tx)
      .select({
        contributionId: contributions.id,
        paymentId: payments.id,
        supporterName: contributions.supporterName,
        socialPlatform: contributions.socialPlatform,
        socialHandle: contributions.socialHandle,
        grossMinor: payments.grossMinor,
        payerFingerprintHash: payments.payerFingerprintHash,
        settledAt: payments.settledAt,
        thankedAt: contributions.thankedAt,
      })
      .from(payments)
      .innerJoin(contributions, eq(contributions.paymentId, payments.id))
      .where(
        and(
          eligible(creatorId),
          gte(payments.settledAt, opts.since),
          opts.onlyUnthanked ? isNull(contributions.thankedAt) : undefined,
        ),
      )
      .orderBy(payments.settledAt)
      .limit(500);
  }

  async countUnthanked(creatorId: string, since: Date, tx?: Executor): Promise<number> {
    const [row] = await this.exec(tx)
      .select({ n: count() })
      .from(payments)
      .innerJoin(contributions, eq(contributions.paymentId, payments.id))
      .where(and(eligible(creatorId), gte(payments.settledAt, since), isNull(contributions.thankedAt)));
    return row?.n ?? 0;
  }

  /** Marks the creator's own contributions as thanked. Returns how many rows changed. */
  async markThanked(creatorId: string, contributionIds: string[], at: Date, tx?: Executor): Promise<number> {
    if (!contributionIds.length) return 0;
    const rows = await this.exec(tx)
      .update(contributions)
      .set({ thankedAt: at })
      .where(and(eq(contributions.creatorId, creatorId), inArray(contributions.id, contributionIds), isNull(contributions.thankedAt)))
      .returning({ id: contributions.id });
    return rows.length;
  }

  async insert(value: typeof shoutouts.$inferInsert, tx?: Executor) {
    const [row] = await this.exec(tx).insert(shoutouts).values(value).returning();
    return row;
  }

  async lastPostedAt(creatorId: string, tx?: Executor): Promise<Date | null> {
    const [row] = await this.exec(tx)
      .select({ at: shoutouts.createdAt })
      .from(shoutouts)
      .where(eq(shoutouts.creatorId, creatorId))
      .orderBy(desc(shoutouts.createdAt))
      .limit(1);
    return row?.at ?? null;
  }

  /** Succeeded payments (support and sales) per traffic source, for the creator's own dashboard. */
  async sourceTotals(creatorId: string, tx?: Executor) {
    const rows = await this.exec(tx)
      .select({
        source: payments.trafficSource,
        payments: count(),
        grossMinor: sql<string>`coalesce(sum(${payments.grossMinor}), 0)`,
      })
      .from(payments)
      .where(and(eq(payments.creatorId, creatorId), eq(payments.status, "succeeded")))
      .groupBy(payments.trafficSource);
    return rows.map((r) => ({ source: r.source, payments: r.payments, grossMinor: Number(r.grossMinor) }));
  }
}
