import "server-only";
import type { Executor } from "@/server/db/client";
import { eq, sql } from "drizzle-orm";
import { platformSettings, platformSettingsHistory } from "@/server/db/schema";
import { BaseRepository } from "./BaseRepository";

export class PlatformSettingsRepository extends BaseRepository {
  async all(tx?: Executor): Promise<{ key: string; value: unknown }[]> {
    return this.exec(tx).select({ key: platformSettings.key, value: platformSettings.value }).from(platformSettings);
  }

  async allWithVersion(tx?: Executor) {
    return this.exec(tx).select({ key: platformSettings.key, value: platformSettings.value, version: platformSettings.version }).from(platformSettings);
  }

  async get(key: string, tx?: Executor) {
    const [row] = await this.exec(tx).select().from(platformSettings).where(eq(platformSettings.key, key)).limit(1);
    return row ?? null;
  }

  /** Row-locks a stored setting (null if it was never saved: the upsert's conflict handles that). */
  async lock(key: string, tx: Executor) {
    const [row] = await tx.select().from(platformSettings).where(eq(platformSettings.key, key)).for("update").limit(1);
    return row ?? null;
  }

  /** Upsert a setting, bump its version and append the history row (same transaction). */
  async set(key: string, value: unknown, changedBy: string, tx: Executor): Promise<number> {
    const [row] = await tx
      .insert(platformSettings)
      .values({ key, value, version: 1, updatedBy: changedBy })
      .onConflictDoUpdate({
        target: platformSettings.key,
        set: { value, version: sql`${platformSettings.version} + 1`, updatedBy: changedBy, updatedAt: new Date() },
      })
      .returning({ version: platformSettings.version });
    await tx.insert(platformSettingsHistory).values({ key, value, version: row.version, changedBy });
    return row.version;
  }
}
