import "server-only";
import { and, desc, eq } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";
import { BaseRepository } from "./BaseRepository";

/** Append-only: there is no update or delete, and the database trigger rejects them anyway. */
export class AuditRepository extends BaseRepository {
  async append(entry: typeof auditLogs.$inferInsert, tx?: Executor): Promise<void> {
    await this.exec(tx).insert(auditLogs).values(entry);
  }

  async listForTarget(targetType: string, targetId: string, limit = 50, tx?: Executor) {
    return this.exec(tx)
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.targetType, targetType), eq(auditLogs.targetId, targetId)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
  }

  async recent(limit = 100, tx?: Executor) {
    return this.exec(tx).select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(Math.min(limit, 500));
  }
}
