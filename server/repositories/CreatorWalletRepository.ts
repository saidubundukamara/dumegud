import "server-only";
import { eq, sql } from "drizzle-orm";
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

  async markActive(userId: string, account: { id: string; uvan: string }, at: Date, tx?: Executor): Promise<void> {
    await this.exec(tx)
      .update(creatorWallets)
      .set({ monimeFinancialAccountId: account.id, uvan: account.uvan, status: "active", lastError: null, lastAttemptAt: at })
      .where(eq(creatorWallets.userId, userId));
  }

  /** Count a failed attempt; the wallet becomes `failed` once `failAfter` attempts are used up. */
  async recordFailure(userId: string, error: string, failAfter: number, at: Date, tx?: Executor): Promise<CreatorWallet> {
    const [row] = await this.exec(tx)
      .update(creatorWallets)
      .set({
        attempts: sql`${creatorWallets.attempts} + 1`,
        lastError: error,
        lastAttemptAt: at,
        status: sql`case when ${creatorWallets.attempts} + 1 >= ${failAfter} then 'failed'::creator_wallet_status else 'pending'::creator_wallet_status end`,
      })
      .where(eq(creatorWallets.userId, userId))
      .returning();
    return row;
  }

  /** Stops all money movement into the wallet (transfers skip a frozen wallet). */
  async freeze(userId: string, tx?: Executor): Promise<void> {
    await this.exec(tx).update(creatorWallets).set({ status: "frozen" }).where(eq(creatorWallets.userId, userId));
  }

}
