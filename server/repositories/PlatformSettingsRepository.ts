import "server-only";
import type { Executor } from "@/server/db/client";
import { platformSettings } from "@/server/db/schema";
import { BaseRepository } from "./BaseRepository";

export class PlatformSettingsRepository extends BaseRepository {
  async all(tx?: Executor): Promise<{ key: string; value: unknown }[]> {
    return this.exec(tx).select({ key: platformSettings.key, value: platformSettings.value }).from(platformSettings);
  }
}
