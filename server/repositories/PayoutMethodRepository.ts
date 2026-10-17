import "server-only";
import { and, eq, lt, ne } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { payoutMethods, type PayoutMethod, type PayoutMethodStatus } from "@/server/db/schema";
import { BaseRepository } from "./BaseRepository";

export class PayoutMethodRepository extends BaseRepository {
  /** The user's current method (anything not disabled), if any. */
  async current(userId: string, tx?: Executor): Promise<PayoutMethod | null> {
    const [row] = await this.exec(tx)
      .select()
      .from(payoutMethods)
      .where(and(eq(payoutMethods.userId, userId), ne(payoutMethods.status, "disabled")))
      .limit(1);
    return row ?? null;
  }

  async findById(id: string, tx?: Executor): Promise<PayoutMethod | null> {
    const [row] = await this.exec(tx).select().from(payoutMethods).where(eq(payoutMethods.id, id)).limit(1);
    return row ?? null;
  }

  async disableCurrent(userId: string, tx?: Executor): Promise<void> {
    await this.exec(tx)
      .update(payoutMethods)
      .set({ status: "disabled" })
      .where(and(eq(payoutMethods.userId, userId), ne(payoutMethods.status, "disabled")));
  }

  async insert(data: typeof payoutMethods.$inferInsert, tx?: Executor): Promise<PayoutMethod> {
    const [row] = await this.exec(tx).insert(payoutMethods).values(data).returning();
    return row;
  }

  /** cooling_off → active once the cooldown has passed. */
  async promoteIfCooled(id: string, now: Date, tx?: Executor): Promise<PayoutMethod | null> {
    const [row] = await this.exec(tx)
      .update(payoutMethods)
      .set({ status: "active" })
      .where(and(eq(payoutMethods.id, id), eq(payoutMethods.status, "cooling_off"), lt(payoutMethods.cooldownUntil, now)))
      .returning();
    return row ?? null;
  }

  async setStatus(id: string, status: PayoutMethodStatus, tx?: Executor): Promise<void> {
    await this.exec(tx).update(payoutMethods).set({ status }).where(eq(payoutMethods.id, id));
  }
}
