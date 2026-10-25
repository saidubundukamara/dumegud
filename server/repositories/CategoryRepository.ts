import "server-only";
import { and, asc, eq } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { categories, type Category } from "@/server/db/schema";
import { BaseRepository } from "./BaseRepository";

export type CategoryWrite = Pick<Category, "slug" | "name" | "active" | "position">;

export class CategoryRepository extends BaseRepository {
  async listActive(tx?: Executor): Promise<Category[]> {
    return this.exec(tx).select().from(categories).where(eq(categories.active, true)).orderBy(asc(categories.position));
  }

  async isActive(id: string, tx?: Executor): Promise<boolean> {
    const [row] = await this.exec(tx)
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.active, true)))
      .limit(1);
    return Boolean(row);
  }

  /** Every category, hidden ones too (admin editor). */
  async listAll(tx?: Executor): Promise<Category[]> {
    return this.exec(tx).select().from(categories).orderBy(asc(categories.position), asc(categories.name));
  }

  async lockById(id: string, tx: Executor): Promise<Category | null> {
    const [row] = await tx.select().from(categories).where(eq(categories.id, id)).for("update").limit(1);
    return row ?? null;
  }

  /** Throws a unique violation when the slug is taken. */
  async insert(data: CategoryWrite, tx?: Executor): Promise<Category> {
    const [row] = await this.exec(tx).insert(categories).values(data).returning();
    return row;
  }

  /** Throws a unique violation when the slug is taken. */
  async update(id: string, data: CategoryWrite, tx?: Executor): Promise<Category | null> {
    const [row] = await this.exec(tx).update(categories).set(data).where(eq(categories.id, id)).returning();
    return row ?? null;
  }
}
