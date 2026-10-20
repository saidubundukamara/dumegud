import "server-only";
import { logger } from "@/server/lib/logger";
import type { JobRepository } from "@/server/repositories/JobRepository";

export type JobContext = {
  now: Date;
  /** False once the run's time budget is used up: stop taking new rows (the next run continues). */
  hasTime(): boolean;
};

export type JobResult = { processed: number; errors: number; tags?: string[]; detail?: Record<string, unknown> };

export type JobOutcome = JobResult & { status: "succeeded" | "failed" | "skipped" };

export type JobServiceDeps = {
  repos: { jobs: JobRepository };
  now?: () => Date;
  /** Lease length: longer than any run can take, so a crashed run frees the job on its own. */
  leaseMs?: number;
  /**
   * Time budget for one run. External schedulers give up after ~30s (cron-job.org), so runs stay
   * well inside that and leave the rest of a batch to the next run.
   */
  budgetMs?: number;
};

/**
 * Runs background jobs (implementation.md Phase 9). Whatever triggers a job (Vercel Cron,
 * cron-job.org, a manual curl), at most one run of each job is active at a time: the run holds a
 * lease row, overlapping invocations are recorded as `skipped`. Every run is recorded in
 * `job_runs`. Jobs themselves must be idempotent; the lease only avoids wasted work.
 */
export class JobService {
  private readonly now: () => Date;
  private readonly leaseMs: number;
  private readonly budgetMs: number;

  constructor(private readonly deps: JobServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.leaseMs = deps.leaseMs ?? 5 * 60_000;
    this.budgetMs = deps.budgetMs ?? 20_000;
  }

  async run(name: string, job: (ctx: JobContext) => Promise<JobResult>): Promise<JobOutcome> {
    const jobs = this.deps.repos.jobs;
    const startedAt = this.now();
    const runId = crypto.randomUUID();
    if (!(await jobs.claimLease(name, runId, startedAt, new Date(startedAt.getTime() + this.leaseMs)))) {
      await jobs.recordSkipped(name, startedAt);
      logger.info("job skipped: another run holds the lease", { job: name });
      return { status: "skipped", processed: 0, errors: 0 };
    }

    await jobs.startRun(runId, name, startedAt);
    const deadline = startedAt.getTime() + this.budgetMs;
    const ctx: JobContext = { now: startedAt, hasTime: () => this.now().getTime() < deadline };
    try {
      const result = await job(ctx);
      await jobs.finishRun(runId, this.now(), { status: "succeeded", processed: result.processed, errors: result.errors, detail: result.detail });
      if (result.errors) logger.warn("job finished with errors", { job: name, processed: result.processed, errors: result.errors });
      return { status: "succeeded", ...result };
    } catch (err) {
      logger.error("job failed", { job: name, err });
      const message = err instanceof Error ? err.message : "unexpected error";
      await jobs.finishRun(runId, this.now(), { status: "failed", processed: 0, errors: 1, error: message });
      return { status: "failed", processed: 0, errors: 1 };
    } finally {
      await jobs.releaseLease(name, runId).catch((err) => logger.warn("job lease not released", { job: name, err }));
    }
  }

  async history(limit = 20) {
    const [latest, recent] = await Promise.all([this.deps.repos.jobs.latestPerJob(), this.deps.repos.jobs.recentRuns(limit)]);
    return { latest, recent };
  }
}
