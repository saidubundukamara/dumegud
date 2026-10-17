import "server-only";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import {
  productAssets,
  products,
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

  async listByStatus(status: ProductStatus, limit = 50, tx?: Executor): Promise<Product[]> {
    return this.exec(tx).select().from(products).where(eq(products.status, status)).orderBy(asc(products.updatedAt)).limit(limit);
  }

  /** Owner-scoped edit of a product that isn't suspended. */
  async updateOwned(creatorId: string, id: string, patch: Partial<Product>, tx?: Executor): Promise<Product | null> {
    const [row] = await this.exec(tx)
      .update(products)
      .set(patch)
      .where(and(eq(products.id, id), eq(products.creatorId, creatorId), ne(products.status, "suspended")))
      .returning();
    return row ?? null;
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

  async setScanStatus(productId: string, from: ScanStatus, to: ScanStatus, tx?: Executor): Promise<void> {
    await this.exec(tx)
      .update(productAssets)
      .set({ scanStatus: to })
      .where(and(eq(productAssets.productId, productId), eq(productAssets.scanStatus, from)));
  }

  async deleteAsset(id: string, tx?: Executor): Promise<void> {
    await this.exec(tx).delete(productAssets).where(eq(productAssets.id, id));
  }
}
