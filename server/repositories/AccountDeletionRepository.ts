import "server-only";
import { and, asc, eq, isNull, lte } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { accountDeletions, type AccountDeletion } from "@/server/db/schema";
import { BaseRepository } from "./BaseRepository";

const open = (userId: string) => and(eq(accountDeletions.userId, userId), isNull(accountDeletions.canceledAt), isNull(accountDeletions.erasedAt));

export class AccountDeletionRepository extends BaseRepository {
  /** The request still in its grace period (at most one, by partial unique index). */
  async findOpen(userId: string, tx?: Executor): Promise<AccountDeletion | null> {
    const [row] = await this.exec(tx).select().from(accountDeletions).where(open(userId)).limit(1);
    return row ?? null;
  }

  async hasOpenRequest(userId: string, tx?: Executor): Promise<boolean> {
    return (await this.findOpen(userId, tx)) !== null;
  }

  async findById(id: string, tx?: Executor): Promise<AccountDeletion | null> {
    const [row] = await this.exec(tx).select().from(accountDeletions).where(eq(accountDeletions.id, id)).limit(1);
    return row ?? null;
  }

  /** The latest request of any state, for the admin view. */
  async latestForUser(userId: string, tx?: Executor): Promise<AccountDeletion | null> {
    const rows = await this.exec(tx).select().from(accountDeletions).where(eq(accountDeletions.userId, userId));
    return rows.sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())[0] ?? null;
  }

  /** Throws a unique violation if a request is already open (callers check isUniqueViolation). */
  async insert(data: { userId: string; requestedAt: Date; eraseAfter: Date; forfeitedMinor: number }, tx?: Executor): Promise<AccountDeletion> {
    const [row] = await this.exec(tx).insert(accountDeletions).values(data).returning();
    return row;
  }

  async cancel(userId: string, at: Date, tx?: Executor): Promise<AccountDeletion | null> {
    const [row] = await this.exec(tx).update(accountDeletions).set({ canceledAt: at }).where(open(userId)).returning();
    return row ?? null;
  }

  async listDue(now: Date, limit: number, tx?: Executor): Promise<AccountDeletion[]> {
    return this.exec(tx)
      .select()
      .from(accountDeletions)
      .where(and(lte(accountDeletions.eraseAfter, now), isNull(accountDeletions.canceledAt), isNull(accountDeletions.erasedAt)))
      .orderBy(asc(accountDeletions.eraseAfter))
      .limit(limit);
  }

  /** Locks the row and returns it only while still open, so two job runs can't erase twice. */
  async lockOpen(id: string, tx: Executor): Promise<AccountDeletion | null> {
    const [row] = await tx
      .select()
      .from(accountDeletions)
      .where(and(eq(accountDeletions.id, id), isNull(accountDeletions.canceledAt), isNull(accountDeletions.erasedAt)))
      .for("update")
      .limit(1);
    return row ?? null;
  }

  async markErased(id: string, at: Date, tx?: Executor): Promise<void> {
    await this.exec(tx).update(accountDeletions).set({ erasedAt: at }).where(eq(accountDeletions.id, id));
  }
}
