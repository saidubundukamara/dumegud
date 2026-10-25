import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { kycSubmissions, type KycStatus, type KycSubmission } from "@/server/db/schema";
import type { Cursor } from "@/server/lib/cursor";
import { BaseRepository } from "./BaseRepository";
import { newestFirst, olderThan } from "./keyset";

export class KycRepository extends BaseRepository {
  /** Throws a unique violation if the user already has a pending submission. */
  async insert(data: typeof kycSubmissions.$inferInsert, tx?: Executor): Promise<KycSubmission> {
    const [row] = await this.exec(tx).insert(kycSubmissions).values(data).returning();
    return row;
  }

  async latestForUser(userId: string, tx?: Executor): Promise<KycSubmission | null> {
    const [row] = await this.exec(tx)
      .select()
      .from(kycSubmissions)
      .where(eq(kycSubmissions.userId, userId))
      .orderBy(desc(kycSubmissions.createdAt))
      .limit(1);
    return row ?? null;
  }

  async approvedForUser(userId: string, tx?: Executor): Promise<KycSubmission | null> {
    const [row] = await this.exec(tx)
      .select()
      .from(kycSubmissions)
      .where(and(eq(kycSubmissions.userId, userId), eq(kycSubmissions.status, "approved")))
      .orderBy(desc(kycSubmissions.reviewedAt))
      .limit(1);
    return row ?? null;
  }

  async findById(id: string, tx?: Executor): Promise<KycSubmission | null> {
    const [row] = await this.exec(tx).select().from(kycSubmissions).where(eq(kycSubmissions.id, id)).limit(1);
    return row ?? null;
  }

  async listByStatus(status: KycStatus, limit = 50, tx?: Executor): Promise<KycSubmission[]> {
    return this.exec(tx).select().from(kycSubmissions).where(eq(kycSubmissions.status, status)).orderBy(asc(kycSubmissions.createdAt)).limit(limit);
  }

  /** Decided submissions, newest first (the review history). */
  async listDecided(status: Exclude<KycStatus, "pending">, limit = 50, tx?: Executor, cursor?: Cursor | null): Promise<KycSubmission[]> {
    return this.exec(tx)
      .select()
      .from(kycSubmissions)
      .where(and(eq(kycSubmissions.status, status), olderThan(kycSubmissions.createdAt, kycSubmissions.id, cursor)))
      .orderBy(...newestFirst(kycSubmissions.createdAt, kycSubmissions.id))
      .limit(limit);
  }

  /** Guarded review decision (only a pending submission can be decided). */
  async decide(
    id: string,
    to: Exclude<KycStatus, "pending">,
    review: { reviewerId: string; reviewNotes: string | null; rejectionReasonCode: string | null; reviewedAt: Date },
    tx?: Executor,
  ): Promise<KycSubmission | null> {
    const [row] = await this.exec(tx)
      .update(kycSubmissions)
      .set({ status: to, ...review })
      .where(and(eq(kycSubmissions.id, id), eq(kycSubmissions.status, "pending")))
      .returning();
    return row ?? null;
  }

  async listForUser(userId: string, tx?: Executor): Promise<KycSubmission[]> {
    return this.exec(tx).select().from(kycSubmissions).where(eq(kycSubmissions.userId, userId)).orderBy(asc(kycSubmissions.createdAt));
  }

}
