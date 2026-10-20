import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Executor } from "@/server/db/client";
import { jobLeases, jobRuns, type JobRun, type JobRunStatus } from "@/server/db/schema";
import { BaseRepository } from "./BaseRepository";

export type FinishedRun = {
  status: Exclude<JobRunStatus, "running">;
  processed: number;
  errors: number;
  detail?: Record<string, unknown> | null;
  error?: string | null;
};

export class JobRepository extends BaseRepository {
  /**
   * Take the job's lease until `until`. One atomic statement: a missing row is inserted, an
   * expired one is taken over, and a live one is left alone (returns false).
   */
  async claimLease(name: string, runId: string, now: Date, until: Date, tx?: Executor): Promise<boolean> {
    const rows = await this.exec(tx)
      .insert(jobLeases)
      .values({ name, runId, lockedUntil: until })
      .onConflictDoUpdate({
        target: jobLeases.name,
        set: { runId, lockedUntil: until },
        setWhere: sql`${jobLeases.lockedUntil} < ${now}`,
      })
      .returning({ name: jobLeases.name });
    return rows.length > 0;
  }

  /** Release only our own lease (a run that overran it may have been replaced). */
  async releaseLease(name: string, runId: string, tx?: Executor): Promise<void> {
    await this.exec(tx).delete(jobLeases).where(and(eq(jobLeases.name, name), eq(jobLeases.runId, runId)));
  }

  async startRun(id: string, name: string, at: Date, tx?: Executor): Promise<void> {
    await this.exec(tx).insert(jobRuns).values({ id, name, status: "running", startedAt: at });
  }

  async recordSkipped(name: string, at: Date, tx?: Executor): Promise<void> {
    await this.exec(tx).insert(jobRuns).values({ name, status: "skipped", startedAt: at, finishedAt: at });
  }

  async finishRun(id: string, at: Date, result: FinishedRun, tx?: Executor): Promise<void> {
    await this.exec(tx)
      .update(jobRuns)
      .set({
        status: result.status,
        finishedAt: at,
        processed: result.processed,
        errors: result.errors,
        detail: result.detail ?? null,
        error: result.error?.slice(0, 500) ?? null,
      })
      .where(eq(jobRuns.id, id));
  }

  async recentRuns(limit = 20, tx?: Executor): Promise<JobRun[]> {
    return this.exec(tx).select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(Math.min(limit, 200));
  }

  /** The latest non-skipped run of each job. */
  async latestPerJob(tx?: Executor): Promise<JobRun[]> {
    return this.exec(tx)
      .selectDistinctOn([jobRuns.name])
      .from(jobRuns)
      .where(sql`${jobRuns.status} <> 'skipped'`)
      .orderBy(jobRuns.name, desc(jobRuns.startedAt));
  }
}
