import "server-only";
import { and, asc, desc, eq, exists, gt, inArray, isNotNull, isNull, ne, notExists } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import {
  accountDeletions,
  creatorProfiles,
  entitlements,
  productAssets,
  products,
  users,
  type AssetKind,
  type Product,
  type ProductAsset,
  type ProductStatus,
  type ScanStatus,
} from "@/server/db/schema";
import { BaseRepository } from "./BaseRepository";

export type ProductWrite = Pick<
  Product,
  "title" | "description" | "categoryId" | "priceMinor" | "licenseType" | "licenseText" | "downloadLimit" | "accessDays"
>;

export class ProductRepository extends BaseRepository {
  async insert(creatorId: string, data: ProductWrite, tx?: Executor): Promise<Product> {
    const [row] = await this.exec(tx).insert(products).values({ creatorId, ...data }).returning();
    return row;
  }

  /** Row-locks the product: serialises review decisions, file changes and edits. */
  async lockById(id: string, tx: Executor): Promise<Product | null> {
    const [row] = await tx.select().from(products).where(eq(products.id, id)).for("update").limit(1);
    return row ?? null;
  }

  async findById(id: string, tx?: Executor): Promise<Product | null> {
    const [row] = await this.exec(tx).select().from(products).where(eq(products.id, id)).limit(1);
    return row ?? null;
  }

  /** Owner-scoped read: the creatorId filter is the IDOR guard. */
  async findOwned(creatorId: string, id: string, tx?: Executor): Promise<Product | null> {
    const [row] = await this.exec(tx)
      .select()
      .from(products)
      .where(and(eq(products.id, id), eq(products.creatorId, creatorId)))
      .limit(1);
    return row ?? null;
  }

  async listOwned(creatorId: string, tx?: Executor): Promise<Product[]> {
    return this.exec(tx).select().from(products).where(eq(products.creatorId, creatorId)).orderBy(desc(products.updatedAt)).limit(100);
  }

  async listPublishedForCreator(creatorId: string, limit = 24, tx?: Executor): Promise<Product[]> {
    return this.exec(tx)
      .select()
      .from(products)
      .where(and(eq(products.creatorId, creatorId), eq(products.status, "published")))
      .orderBy(desc(products.publishedAt))
      .limit(limit);
  }

  /**
   * Products that can be bought right now, for the sitemap: published, with a clean file, by an
   * active creator whose page is live (the same rules as the public product page).
   */
  async listPublicForSitemap(limit: number, tx?: Executor): Promise<{ id: string; updatedAt: Date }[]> {
    const db = this.exec(tx);
    return db
      .select({ id: products.id, updatedAt: products.updatedAt })
      .from(products)
      .innerJoin(creatorProfiles, eq(creatorProfiles.userId, products.creatorId))
      .innerJoin(users, eq(users.id, products.creatorId))
      .where(
        and(
          eq(products.status, "published"),
          eq(creatorProfiles.status, "published"),
          eq(users.status, "active"),
          exists(
            db
              .select({ id: productAssets.id })
              .from(productAssets)
              .where(and(eq(productAssets.productId, products.id), eq(productAssets.kind, "file"), eq(productAssets.scanStatus, "clean"))),
          ),
        ),
      )
      .orderBy(desc(products.updatedAt))
      .limit(limit);
  }

  async listByStatus(status: ProductStatus, limit = 50, tx?: Executor): Promise<Product[]> {
    return this.exec(tx).select().from(products).where(eq(products.status, status)).orderBy(asc(products.updatedAt)).limit(limit);
  }

  /**
   * Owner-scoped edit of a product that isn't suspended. `expectedStatus` is the status the edit
   * was decided against: if a review decision or unpublish changed it meanwhile, nothing is written.
   */
  async updateOwned(
    creatorId: string,
    id: string,
    patch: Partial<Product>,
    expectedStatus?: ProductStatus,
    tx?: Executor,
  ): Promise<Product | null> {
    const [row] = await this.exec(tx)
      .update(products)
      .set(patch)
      .where(
        and(
          eq(products.id, id),
          eq(products.creatorId, creatorId),
          ne(products.status, "suspended"),
          expectedStatus ? eq(products.status, expectedStatus) : undefined,
        ),
      )
      .returning();
    return row ?? null;
  }

  /** Marks the product changed (its files changed): staff approval checks `updatedAt`. */
  async touch(id: string, tx?: Executor): Promise<void> {
    await this.exec(tx).update(products).set({ updatedAt: new Date() }).where(eq(products.id, id));
  }

  /** Guarded status change (any actor). */
  async setStatus(id: string, from: readonly ProductStatus[], to: ProductStatus, patch: Partial<Product> = {}, tx?: Executor) {
    const [row] = await this.exec(tx)
      .update(products)
      .set({ ...patch, status: to })
      .where(and(eq(products.id, id), inArray(products.status, [...from])))
      .returning();
    return row ?? null;
  }

  // ── Assets ──────────────────────────────────────────────────────────────────

  async insertAsset(data: typeof productAssets.$inferInsert, tx?: Executor): Promise<ProductAsset> {
    const [row] = await this.exec(tx).insert(productAssets).values(data).returning();
    return row;
  }

  async findAsset(id: string, tx?: Executor): Promise<ProductAsset | null> {
    const [row] = await this.exec(tx).select().from(productAssets).where(eq(productAssets.id, id)).limit(1);
    return row ?? null;
  }

  async listAssets(productId: string, kind?: AssetKind, tx?: Executor): Promise<ProductAsset[]> {
    return this.exec(tx)
      .select()
      .from(productAssets)
      .where(kind ? and(eq(productAssets.productId, productId), eq(productAssets.kind, kind)) : eq(productAssets.productId, productId))
      .orderBy(asc(productAssets.createdAt));
  }

  async updateAsset(id: string, patch: Partial<ProductAsset>, tx?: Executor): Promise<ProductAsset | null> {
    const [row] = await this.exec(tx).update(productAssets).set(patch).where(eq(productAssets.id, id)).returning();
    return row ?? null;
  }

  /** Only the listed assets (the ones a reviewer actually saw), and only while still in `from`. */
  async setScanStatus(productId: string, assetIds: string[], from: ScanStatus, to: ScanStatus, tx?: Executor): Promise<void> {
    if (!assetIds.length) return;
    await this.exec(tx)
      .update(productAssets)
      .set({ scanStatus: to })
      .where(and(eq(productAssets.productId, productId), inArray(productAssets.id, assetIds), eq(productAssets.scanStatus, from)));
  }

  /**
   * Finish an upload: only one confirm wins. Guarded by the state it was verified in (still
   * `uploading`, same object key), so a second click can't overwrite or reject a finished asset.
   */
  async finishUpload(id: string, expectedKey: string, patch: Partial<ProductAsset>, tx?: Executor): Promise<ProductAsset | null> {
    const [row] = await this.exec(tx)
      .update(productAssets)
      .set(patch)
      .where(and(eq(productAssets.id, id), eq(productAssets.scanStatus, "uploading"), eq(productAssets.r2Key, expectedKey)))
      .returning();
    return row ?? null;
  }

  async deleteAsset(id: string, tx?: Executor): Promise<void> {
    await this.exec(tx).delete(productAssets).where(eq(productAssets.id, id));
  }

  /** Takes every product off sale. Rows and files stay for buyers who already have access. */
  /**
   * cleanup cron: stored objects of erased creators' products that no buyer can download any more
   * (no entitlement that is unrevoked and unexpired). Erasure keeps them while buyers have access.
   */
  async listPurgeableAssets(now: Date, limit: number, tx?: Executor): Promise<ProductAsset[]> {
    const db = this.exec(tx);
    return db
      .select({ asset: productAssets })
      .from(productAssets)
      .innerJoin(products, eq(products.id, productAssets.productId))
      .where(
        and(
          isNull(productAssets.purgedAt),
          exists(
            db
              .select({ id: accountDeletions.id })
              .from(accountDeletions)
              .where(and(eq(accountDeletions.userId, products.creatorId), isNotNull(accountDeletions.erasedAt))),
          ),
          notExists(
            db
              .select({ id: entitlements.id })
              .from(entitlements)
              .where(and(eq(entitlements.productId, products.id), isNull(entitlements.revokedAt), gt(entitlements.expiresAt, now))),
          ),
        ),
      )
      .limit(limit)
      .then((rows) => rows.map((r) => r.asset));
  }

  async unpublishAllForCreator(creatorId: string, tx?: Executor): Promise<void> {
    await this.exec(tx)
      .update(products)
      .set({ status: "unpublished" })
      .where(and(eq(products.creatorId, creatorId), inArray(products.status, ["published", "pending_review", "draft"])));
  }

}
