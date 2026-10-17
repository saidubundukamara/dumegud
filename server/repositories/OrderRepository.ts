import "server-only";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { downloadEvents, entitlements, orders, payments, products, type Entitlement, type Order } from "@/server/db/schema";
import { BaseRepository } from "./BaseRepository";

export type NewOrder = Omit<typeof orders.$inferInsert, "paymentId" | "id">;

export class OrderRepository extends BaseRepository {
  async insert(paymentId: string, data: NewOrder, tx?: Executor): Promise<Order> {
    const [row] = await this.exec(tx).insert(orders).values({ ...data, paymentId }).returning();
    return row;
  }

  async findByPaymentId(paymentId: string, tx?: Executor): Promise<Order | null> {
    const [row] = await this.exec(tx).select().from(orders).where(eq(orders.paymentId, paymentId)).limit(1);
    return row ?? null;
  }

  async findByAccessTokenHash(hash: string, tx?: Executor): Promise<Order | null> {
    const [row] = await this.exec(tx).select().from(orders).where(eq(orders.accessTokenHash, hash)).limit(1);
    return row ?? null;
  }

  /** Paid orders for a buyer, for "lost your link?". */
  async listSucceededByEmailHash(emailHash: string, limit = 20, tx?: Executor) {
    return this.exec(tx)
      .select({ order: orders, productTitle: products.title })
      .from(orders)
      .innerJoin(payments, eq(payments.id, orders.paymentId))
      .innerJoin(products, eq(products.id, orders.productId))
      .where(and(eq(orders.buyerEmailHash, emailHash), eq(payments.status, "succeeded")))
      .orderBy(desc(orders.createdAt))
      .limit(limit);
  }

  /** Creator's orders with payment state (the creatorId filter is the IDOR guard). */
  async listForCreator(creatorId: string, limit = 50, tx?: Executor) {
    return this.exec(tx)
      .select({ order: orders, payment: payments, productTitle: products.title })
      .from(orders)
      .innerJoin(payments, eq(payments.id, orders.paymentId))
      .innerJoin(products, eq(products.id, orders.productId))
      .where(eq(orders.creatorId, creatorId))
      .orderBy(desc(orders.createdAt))
      .limit(Math.min(limit, 100));
  }

  /** One entitlement per order: replays of settlement insert nothing (unique orderId). */
  async grantEntitlement(data: typeof entitlements.$inferInsert, tx?: Executor): Promise<boolean> {
    const rows = await this.exec(tx)
      .insert(entitlements)
      .values(data)
      .onConflictDoNothing({ target: entitlements.orderId })
      .returning({ id: entitlements.id });
    return rows.length > 0;
  }

  async findEntitlementByOrder(orderId: string, tx?: Executor): Promise<Entitlement | null> {
    const [row] = await this.exec(tx).select().from(entitlements).where(eq(entitlements.orderId, orderId)).limit(1);
    return row ?? null;
  }

  /** Entitlement + its order's payment status, for download checks. */
  async findEntitlementForDownload(id: string, tx?: Executor) {
    const [row] = await this.exec(tx)
      .select({ entitlement: entitlements, order: orders, paymentStatus: payments.status })
      .from(entitlements)
      .innerJoin(orders, eq(orders.id, entitlements.orderId))
      .innerJoin(payments, eq(payments.id, orders.paymentId))
      .where(eq(entitlements.id, id))
      .limit(1);
    return row ?? null;
  }

  /** Atomic: counts a download only while under the limit, not revoked and not expired. */
  async useDownload(id: string, now: Date, tx?: Executor): Promise<Entitlement | null> {
    const [row] = await this.exec(tx)
      .update(entitlements)
      .set({ downloadsUsed: sql`${entitlements.downloadsUsed} + 1` })
      .where(
        and(
          eq(entitlements.id, id),
          lt(entitlements.downloadsUsed, entitlements.downloadLimit),
          isNull(entitlements.revokedAt),
          sql`${entitlements.expiresAt} > ${now}`,
        ),
      )
      .returning();
    return row ?? null;
  }

  async recordDownload(data: typeof downloadEvents.$inferInsert, tx?: Executor): Promise<void> {
    await this.exec(tx).insert(downloadEvents).values(data);
  }

  /** Take the right to send the receipt: true for exactly one caller. */
  async claimReceipt(orderId: string, now: Date, tx?: Executor): Promise<boolean> {
    const rows = await this.exec(tx)
      .update(orders)
      .set({ receiptSentAt: now })
      .where(and(eq(orders.id, orderId), isNull(orders.receiptSentAt)))
      .returning({ id: orders.id });
    return rows.length > 0;
  }

  async releaseReceipt(orderId: string, tx?: Executor): Promise<void> {
    await this.exec(tx).update(orders).set({ receiptSentAt: null }).where(eq(orders.id, orderId));
  }
}
