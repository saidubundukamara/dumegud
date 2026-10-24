import "server-only";
import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { creatorWallets, type CreatorWallet } from "@/server/db/schema";
import { BaseRepository } from "./BaseRepository";

export class CreatorWalletRepository extends BaseRepository {
  /** Create the pending wallet row if missing, and return the current row either way. */
  async ensure(userId: string, tx?: Executor): Promise<CreatorWallet> {
    const db = this.exec(tx);
    await db.insert(creatorWallets).values({ userId }).onConflictDoNothing({ target: creatorWallets.userId });
    const [row] = await db.select().from(creatorWallets).where(eq(creatorWallets.userId, userId)).limit(1);
    return row;
  }

  async findByUserId(userId: string, tx?: Executor): Promise<CreatorWallet | null> {
    const [row] = await this.exec(tx).select().from(creatorWallets).where(eq(creatorWallets.userId, userId)).limit(1);
    return row ?? null;
  }

  /** Row-locks the wallet: the per-creator lock for payouts, deletion and erasure. */
  async lockByUserId(userId: string, tx: Executor): Promise<CreatorWallet | null> {
    const [row] = await tx.select().from(creatorWallets).where(eq(creatorWallets.userId, userId)).for("update").limit(1);
    return row ?? null;
  }

  /**
   * Record the Monime account. A wallet frozen while the provider call was in flight keeps the
   * account id but stays `frozen`: provisioning must never undo a freeze.
   */
  async markActive(userId: string, account: { id: string; uvan: string }, at: Date, tx?: Executor): Promise<CreatorWallet> {
    const [row] = await this.exec(tx)
      .update(creatorWallets)
      .set({
        monimeFinancialAccountId: account.id,
        uvan: account.uvan,
        status: sql`case when ${creatorWallets.status} = 'frozen' then 'frozen'::creator_wallet_status else 'active'::creator_wallet_status end`,
        lastError: null,
        lastAttemptAt: at,
      })
      .where(eq(creatorWallets.userId, userId))
      .returning();
    return row;
  }

  /**
   * Count a failed attempt; the wallet becomes `failed` once `failAfter` attempts are used up.
   * Only a wallet still being provisioned changes: a frozen or active one is returned as is.
   */
  async recordFailure(userId: string, error: string, failAfter: number, at: Date, tx?: Executor): Promise<CreatorWallet> {
    const [row] = await this.exec(tx)
      .update(creatorWallets)
      .set({
        attempts: sql`${creatorWallets.attempts} + 1`,
        lastError: error,
        lastAttemptAt: at,
        status: sql`case when ${creatorWallets.attempts} + 1 >= ${failAfter} then 'failed'::creator_wallet_status else 'pending'::creator_wallet_status end`,
      })
      .where(and(eq(creatorWallets.userId, userId), inArray(creatorWallets.status, ["pending", "failed"])))
      .returning();
    return row ?? (await this.findByUserId(userId, tx))!;
  }

  /** provision-wallets cron: wallets still without a Monime account, least recently tried first. */
  async listRetryable(maxAttempts: number, limit: number, tx?: Executor): Promise<CreatorWallet[]> {
    return this.exec(tx)
      .select()
      .from(creatorWallets)
      .where(and(inArray(creatorWallets.status, ["pending", "failed"]), lt(creatorWallets.attempts, maxAttempts)))
      .orderBy(asc(creatorWallets.lastAttemptAt))
      .limit(limit);
  }

  /** Stops all money movement into the wallet (transfers skip a frozen wallet). */
  async freeze(userId: string, tx?: Executor): Promise<void> {
    await this.exec(tx).update(creatorWallets).set({ status: "frozen" }).where(eq(creatorWallets.userId, userId));
  }

}
