import "server-only";
import { and, asc, eq } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { categories, type Category } from "@/server/db/schema";
import { BaseRepository } from "./BaseRepository";

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
}
