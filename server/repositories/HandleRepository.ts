import "server-only";
import { eq } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { handleHistory, reservedHandles } from "@/server/db/schema";
import { BaseRepository } from "./BaseRepository";

export class HandleRepository extends BaseRepository {
  async isReserved(handleLower: string, tx?: Executor): Promise<boolean> {
    const [row] = await this.exec(tx)
      .select({ handle: reservedHandles.handle })
      .from(reservedHandles)
      .where(eq(reservedHandles.handle, handleLower))
      .limit(1);
    return Boolean(row);
  }

  async findHistory(handleLower: string, tx?: Executor) {
    const [row] = await this.exec(tx).select().from(handleHistory).where(eq(handleHistory.handleLower, handleLower)).limit(1);
    return row ?? null;
  }

  /** Remember a released handle (or refresh it if it was released before). */
  async recordRelease(handleLower: string, profileId: string, releasedAt: Date, tx?: Executor): Promise<void> {
    await this.exec(tx)
      .insert(handleHistory)
      .values({ handleLower, profileId, releasedAt })
      .onConflictDoUpdate({ target: handleHistory.handleLower, set: { profileId, releasedAt } });
  }

  async deleteHistory(handleLower: string, tx?: Executor): Promise<void> {
    await this.exec(tx).delete(handleHistory).where(eq(handleHistory.handleLower, handleLower));
  }
}
