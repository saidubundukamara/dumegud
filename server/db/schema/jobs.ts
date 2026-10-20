import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id } from "./columns";

// Background jobs (implementation.md Phase 9).

export const jobRunStatus = pgEnum("job_run_status", ["running", "succeeded", "failed", "skipped"]);

export type JobRunStatus = (typeof jobRunStatus.enumValues)[number];

/**
 * One row per job name: whoever holds an unexpired lease runs the job. Used instead of a session
 * advisory lock, which isn't safe on a pooled connection (lock and unlock can land on different
 * connections), and a crashed run's lease simply expires.
 */
export const jobLeases = pgTable("job_leases", {
  name: text().primaryKey(),
  runId: uuid().notNull(),
  lockedUntil: timestamp({ withTimezone: true }).notNull(),
});

/** Every cron invocation, including ones skipped because another run held the lease. */
export const jobRuns = pgTable(
  "job_runs",
  {
    id: id(),
    name: text().notNull(),
    status: jobRunStatus().notNull(),
    startedAt: timestamp({ withTimezone: true }).notNull(),
    finishedAt: timestamp({ withTimezone: true }),
    processed: integer().notNull().default(0),
    errors: integer().notNull().default(0),
    detail: jsonb(),
    error: text(),
  },
  (t) => [index().on(t.name, t.startedAt), index().on(t.startedAt)],
);

export type JobRun = typeof jobRuns.$inferSelect;
